import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../core/prisma.service";
import { currencyForCountry } from "../config";
import { AxelorService } from "../axelor/axelor.service";
import { BillingService } from "../billing/billing.service";
import { RegisterDto } from "./tenants.dto";

/** Message volontairement identique pour tous les conflits : on ne révèle pas quels comptes existent. */
const GENERIC_CONFLICT =
  "Impossible de créer l'inscription avec ces informations. Si vous avez déjà un compte, connectez-vous ou contactez le support.";

const RESERVED_LOGINS = new Set([
  "admin", "administrator", "root", "support", "system", "superuser", "user", "users", "test",
  "saas-provisioner", "guest", "anonymous", "demo",
]);

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

@Injectable()
export class TenantsService {
  private readonly log = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly axelor: AxelorService,
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}

  /** Étape 1 : enregistre la demande locale et renvoie l'URL Stripe. */
  async resolveCompanyByTaxId(taxId: string, login?: string) {
    const normalized = taxId.trim();
    if (!normalized) return null;
    const company = await this.axelor.findCompanyByTaxId(normalized);
    if (!company) return null;

    const result: { companyName: string; country: string; expiresOn?: string; hasActiveOffer?: boolean; canProceed?: boolean } = {
      companyName: company.name,
      country: company.country ?? "TN",
    };

    if (login && login.trim()) {
      const user = await this.axelor.findUserWithExpiry(login.trim().toLowerCase());
      if (user?.expiresOn) {
        const expiresAt = new Date(user.expiresOn);
        const hasActiveOffer = !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() >= Date.now();
        result.expiresOn = user.expiresOn;
        result.hasActiveOffer = hasActiveOffer;
        result.canProceed = !hasActiveOffer;
      }
    }

    return result;
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const login = dto.login.toLowerCase();
    const taxId = dto.taxId.trim();

    if (RESERVED_LOGINS.has(login)) throw new ConflictException(GENERIC_CONFLICT);

    let companyName = dto.companyName?.trim() ?? "";
    let country = dto.country?.trim().toUpperCase() ?? "";

    if (dto.simpleUser) {
      const company = await this.resolveCompanyByTaxId(taxId, login);
      if (!company) {
        throw new BadRequestException("Aucun compte société n’a été trouvé pour ce matricule fiscal.");
      }
      if (company.hasActiveOffer && company.expiresOn) {
        throw new BadRequestException(
          `Une offre active existe déjà pour ce login jusqu'au ${new Date(company.expiresOn).toLocaleDateString("fr-FR")}.`,
        );
      }
      companyName = company.companyName;
      country = company.country;

      // Rattachement : la société doit déjà avoir un responsable (sinon il n'y aurait personne pour valider les notes de frais).
      try {
        const found = await this.axelor.findCompanyByTaxId(taxId);
        if (!found || !(await this.axelor.findCompanyManagerUserId(found.id))) {
          throw new BadRequestException(
            "Cette société n’a pas encore de responsable. Le responsable doit d’abord créer l’espace de la société.",
          );
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        this.log.error(`Vérification du responsable impossible : ${(e as Error).message}`);
        throw new ServiceUnavailableException("Service momentanément indisponible, réessayez dans un instant.");
      }
    }

    // Purge des demandes ABANDONNÉES depuis plus de 24 h (jamais une demande récente : elle peut être en cours de paiement).
    await this.prisma.tenant.deleteMany({
      where: {
        status: "PENDING_PAYMENT",
        stripeSubscriptionId: null,
        createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) },
      },
    });

    // 1. Conflit local : même login (toujours), ou même e-mail avec un abonnement encore en vie.
    const clash = await this.prisma.tenant.findFirst({
      where: {
        OR: [{ login }, { email, status: { notIn: ["CANCELLED", "FAILED"] } }],
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(GENERIC_CONFLICT);

    // 2. Conflit côté Axelor
    try {
      if ((await this.axelor.userExists(login)) || (await this.axelor.userEmailExists(email))) {
        throw new ConflictException(GENERIC_CONFLICT);
      }
    } catch (e) {
      if (e instanceof ConflictException) throw e;
      this.log.error(`Vérification Axelor impossible : ${(e as Error).message}`);
      throw new ServiceUnavailableException("Service momentanément indisponible, réessayez dans un instant.");
    }

    // 3. Création du tenant (sans mot de passe)
    const normalizedCountry = country || "TN";
    const tenant = await this.prisma.tenant.create({
      data: {
        companyName,
        taxId,
        country: normalizedCountry,
        // Devise d'Axelor : AXELOR_DEFAULT_CURRENCY (CHF) l'emporte sur la devise du pays d'inscription.
        currency: this.config.get<string>("AXELOR_DEFAULT_CURRENCY") || currencyForCountry(normalizedCountry),
        plan: dto.plan,
        email,
        login,
        simpleUser: Boolean(dto.simpleUser),
      },
    });

    // 4. Session Stripe. En cas d'échec, on libère l'e-mail et le login au lieu de les bloquer 24 h.
    try {
      const checkoutUrl = await this.billing.createCheckoutSession(tenant.id, dto.plan);
      return { tenantId: tenant.id, checkoutUrl };
    } catch (e) {
      await this.prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => undefined);
      this.log.error(`Création de la session Stripe impossible : ${(e as Error).message}`);
      throw new ServiceUnavailableException("Le paiement est momentanément indisponible, réessayez dans un instant.");
    }
  }

  /**
   * Étape 2 : appelée par le frontend. Tant que le compte n'est pas actif, seul le statut est renvoyé.
   * Une fois actif : login et nom de société, et l'e-mail MASQUÉ (a***@domaine), pour la page de confirmation.
   */
  async status(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, login: true, email: true, companyName: true },
    });
    if (!t) throw new NotFoundException("Inscription introuvable.");
    if (t.status !== "ACTIVE") return { status: t.status };
    return { status: t.status, login: t.login, companyName: t.companyName, email: maskEmail(t.email) };
  }
}