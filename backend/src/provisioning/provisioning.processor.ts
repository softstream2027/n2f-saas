import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job, UnrecoverableError } from "bullmq";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../core/prisma.service";
import { AxelorService } from "../axelor/axelor.service";
import { MailService } from "../mail/mail.service";
import { accessWindow, toAxelorDate } from "../core/validity";

/**
 * Groupes Axelor trop permissifs pour des abonnés (accès aux données d'autres sociétés, gestion des utilisateurs…).
 * Garde-fou : tant que ALLOW_UNSAFE_GROUP n'est pas "true" (développement uniquement), le provisionnement est refusé.
 */
const UNSAFE_GROUPS = new Set(["NDF", "ERP", "MGT", "VTE", "admins", "Admin N2F"]);

function slug(name: string, max = 8): string {
  const s = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, max);
  return s.padEnd(4, "X");
}

@Processor("provisioning")
export class ProvisioningProcessor extends WorkerHost {
  private readonly logger = new Logger(ProvisioningProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly axelor: AxelorService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {
    super();
  }

  async process(job: Job<any>) {
    switch (job.name) {
      case "provision-tenant":
        return this.provision(job);
      case "manage-access":
        return this.manageAccess(job);
      default:
        this.logger.warn(`Job ignoré : ${job.name}`);
        return;
    }
  }

  private graceDays(): number {
    return Number(this.config.get<string>("ACCESS_GRACE_DAYS", "3"));
  }

  private validityType(): string {
    return this.config.get<string>("AXELOR_USER_VALIDITY_TYPE", "date");
  }

  private numberEnv(key: string): number | undefined {
    const v = this.config.get<string>(key);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  }

  private isLastAttempt(job: Job): boolean {
    return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  }

  private async markJob(jobId: string | undefined, status: string, attempts: number, lastError: string | null) {
    if (!jobId) return;
    await this.prisma.provisioningJob
      .update({
        where: { id: jobId },
        data: {
          status,
          attempts,
          lastError,
          processedAt: status === "DONE" || status === "FAILED" ? new Date() : null,
        },
      })
      .catch(() => undefined);
  }

  /**
   * Provisionnement REPRENABLE : chaque étape n'est exécutée que si son résultat n'est pas déjà enregistré
   * dans le tenant. Une panne en cours de route ne crée ni doublon de partenaire, ni société orpheline réutilisée.
   *
   * Deux parcours :
   *  - nouvelle société (simpleUser = false) : société créée, utilisateur du groupe AXELOR_CLIENT_GROUP_MANAGER (HRM),
   *    isBpmAdministrator = true sur l'utilisateur et hrManager = true sur l'employé ;
   *  - rattachement (simpleUser = true) : société EXISTANTE (retrouvée par matricule fiscal), utilisateur du groupe
   *    AXELOR_CLIENT_GROUP_USER (mobile.hr), employé avec managerUser = responsable de la société.
   */
  private async provision(job: Job<{ jobId?: string; tenantId: string }>) {
    const { tenantId, jobId } = job.data;
    this.logger.log(`Provisioning Axelor : tenant ${tenantId}, tentative ${job.attemptsMade + 1}`);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      this.logger.error(`Tenant introuvable : ${tenantId}`);
      return;
    }
    const wasActive = tenant.status === "ACTIVE";
    if (wasActive && tenant.axelorEmployeeId) {
      this.logger.log(`Tenant ${tenantId} déjà actif : rien à faire.`);
      await this.markJob(jobId, "DONE", job.attemptsMade + 1, null);
      return;
    }
    if (wasActive) {
      this.logger.warn(`Tenant ${tenantId} actif sans fiche employé : réparation.`);
    } else if (!["PROVISIONING", "PAID", "FAILED"].includes(tenant.status)) {
      this.logger.warn(`Provisioning refusé : statut ${tenant.status} (paiement non confirmé ?)`);
      return;
    }

    try {
      // Rattachement à une société existante, ou création d'une nouvelle société
      const isJoin = Boolean(tenant.simpleUser);

      const groupCode = isJoin
        ? this.config.get<string>("AXELOR_CLIENT_GROUP_USER", "mobile.hr")
        : this.config.get<string>("AXELOR_CLIENT_GROUP_MANAGER", "HRM");
      if (UNSAFE_GROUPS.has(groupCode) && this.config.get<string>("ALLOW_UNSAFE_GROUP") !== "true") {
        throw new UnrecoverableError(
          `Le groupe Axelor "${groupCode}" est trop permissif pour des abonnés. Créez un groupe dédié ` +
            `(rôle minimal, permissions filtrées par société) ou, en développement seulement, ALLOW_UNSAFE_GROUP=true.`,
        );
      }

      // Devise : AXELOR_DEFAULT_CURRENCY l'emporte
      const defaultCurrency = this.config.get<string>("AXELOR_DEFAULT_CURRENCY", "CHF");
      const currencyId = await this.axelor.currencyId(defaultCurrency);

      const groupId = await this.axelor.groupId(groupCode);
      const printingSettingsId = await this.axelor.printingSettingsId(
        this.config.get<string>("AXELOR_PRINTING_SETTINGS_NAME", "Default print settings"),
      );

      const companyCode = tenant.companyCode ?? `${slug(tenant.companyName)}-${tenant.id.slice(-6).toUpperCase()}`;
      if (!tenant.companyCode) {
        await this.prisma.tenant.update({ where: { id: tenantId }, data: { companyCode } });
      }

      // 1. Partenaire de la société (nouvelle société uniquement : en rattachement, il existe déjà)
      let partnerId = tenant.axelorPartnerId;
      if (!partnerId && !isJoin) {
        partnerId = await this.axelor.createPartner({
          name: tenant.companyName,
          taxId: tenant.taxId,
          companyId: undefined,
        });
        await this.prisma.tenant.update({ where: { id: tenantId }, data: { axelorPartnerId: partnerId } });
      }

      // 2. Société
      let companyId = tenant.axelorCompanyId;
      if (!companyId) {
        if (isJoin) {
          // Rattachement : on ne crée JAMAIS de société, on retrouve celle du matricule fiscal
          companyId = (await this.axelor.findCompanyByTaxId(tenant.taxId))?.id ?? null;
          if (!companyId) {
            throw new UnrecoverableError(
              `Rattachement impossible : aucune société Axelor pour le matricule fiscal "${tenant.taxId}".`,
            );
          }
        } else {
          companyId = await this.axelor.findCompanyByCodeOrNameOrTaxId(
            companyCode,
            tenant.companyName,
            tenant.taxId,
          );
          if (!companyId) {
            const nameTaken = await this.axelor.companyNameExists(tenant.companyName);
            companyId = await this.axelor.createCompany({
              name: nameTaken ? `${tenant.companyName} (${companyCode})` : tenant.companyName,
              code: companyCode,
              partnerId: partnerId as number,
              currencyId,
              printingSettingsId,
            });
          }
        }
        await this.prisma.tenant.update({ where: { id: tenantId }, data: { axelorCompanyId: companyId } });
      }

      // Rattachement : le responsable de la société (isBpmAdministrator) doit exister, vérifié AVANT de créer quoi que ce soit
      let managerUserId: number | undefined;
      if (isJoin) {
        const found = await this.axelor.findCompanyManagerUserId(companyId);
        if (!found) {
          throw new UnrecoverableError(
            `La société ${companyId} n'a aucun responsable (utilisateur actif avec isBpmAdministrator). ` +
              `Désignez-en un dans Axelor puis relancez le provisioning.`,
          );
        }
        managerUserId = found;
      }

      await this.axelor.setupAccounting(companyId);

      // Rattachement économique du tiers partenaire à la société active
      if (partnerId) {
        const partner = await this.axelor.getPartner(partnerId);
        const partnerCompanySet = (partner?.companySet ?? [])
          .map((c: any) => c?.id)
          .filter((id: number | undefined) => typeof id === "number");
        if (!partnerCompanySet.includes(companyId)) {
          await this.axelor.updatePartnerCompanySet(partnerId, companyId);
        }
      }

      // 3. Séquence de numérotation des notes de frais
      let sequenceId = tenant.axelorSequenceId;
      if (!sequenceId) {
        sequenceId =
          (await this.axelor.findExpenseSequenceId(companyId)) ??
          (await this.axelor.createExpenseSequence({
            companyId,
            name: "N° de note de frais",
            prefix: this.config.get<string>("EXPENSE_SEQ_PREFIX", "NF%YY"),
            padding: 4,
          }));
        await this.prisma.tenant.update({ where: { id: tenantId }, data: { axelorSequenceId: sequenceId } });
      }

      // 4. Configuration RH de la société
      let hrConfigId = tenant.axelorHrConfigId;
      if (!hrConfigId) {
        // 🛡️ SÉCURITÉ : On récupère les IDs des modèles d'impression par leur nom si les variables d'env ne sont pas définies
        const expenseReportTemplateId =
          this.numberEnv("HR_EXPENSE_REPORT_TEMPLATE_ID") ?? (await this.axelor.printingSettingsId("Expense"));
        const annualReportTemplateId =
          this.numberEnv("HR_ANNUAL_REPORT_TEMPLATE_ID") ?? (await this.axelor.printingSettingsId("EmployeeAnnualReport"));

        hrConfigId =
          (await this.axelor.findHrConfigId(companyId)) ??
          (await this.axelor.createHrConfig({
            companyId,
            sequenceId,
            expenseReportTemplateId,
            annualReportTemplateId,
          }));
        await this.prisma.tenant.update({ where: { id: tenantId }, data: { axelorHrConfigId: hrConfigId } });
      }

      // 5. Adresse e-mail et Tiers (personne) liés à l'utilisateur
      let userPartnerId = tenant.axelorUserPartnerId;
      if (!userPartnerId) {
        this.logger.log(`Création de l'EmailAddress pour ${tenant.email}...`);
        const emailAddressId = await this.axelor.createEmailAddress(tenant.email);

        this.logger.log(`Création du Tiers pour ${tenant.login}...`);
        userPartnerId = await this.axelor.createUserPartner({ name: tenant.login, emailAddressId, companyId });
        await this.prisma.tenant.update({ where: { id: tenantId }, data: { axelorUserPartnerId: userPartnerId } });
      }
      const userPartner = await this.axelor.getPartner(userPartnerId);
      const userCompanySet = (userPartner?.companySet ?? [])
        .map((c: any) => c?.id)
        .filter((id: number | undefined) => typeof id === "number");
      if (!userCompanySet.includes(companyId)) {
        await this.axelor.updatePartnerCompanySet(userPartnerId, companyId);
      }

      // 6. Utilisateur (validité = période payée + jours de grâce)
      let userId = tenant.axelorUserId;

      if (!userId) {
        // Mot de passe temporaire : n'existe qu'en mémoire, pour l'utilisateur créé par CETTE exécution
        let plainPassword: string | null = null;

        const existing = await this.axelor.findUser(tenant.login);
        if (existing) {
          if (existing.activeCompanyId === companyId) {
            userId = existing.id; // Reprise d'une tentative précédente
          } else {
            throw new UnrecoverableError(`Le login "${tenant.login}" est déjà utilisé dans Axelor.`);
          }
        } else {
          const { activateOn, expiresOn } = accessWindow(tenant.currentPeriodEnd, this.graceDays());

          const userResult = await this.axelor.createUser({
            login: tenant.login,
            name: tenant.login,
            email: tenant.email,
            companyId,
            groupId,
            partnerId: userPartnerId,
            isBpmAdministrator: !isJoin, // responsable de la société = premier inscrit
            activateOn: toAxelorDate(activateOn, this.validityType()),
            expiresOn: toAxelorDate(expiresOn, this.validityType()),
          });
          userId = userResult.userId;
          plainPassword = userResult.plainPassword;
        }
        await this.prisma.tenant.update({ where: { id: tenantId }, data: { axelorUserId: userId } });

        // 6.1 E-mail d'accès (identifiant + mot de passe), envoyé par le backend tout de suite pour un
        // utilisateur qu'on vient de créer : plainPassword est perdu si une étape suivante échoue puis
        // est rejouée. Un échec d'envoi ne doit pas relancer tout le provisioning.
        if (plainPassword) {
          const sent = await this.mail.sendWelcome(tenant.email, tenant.companyName, tenant.login, plainPassword);
          if (!sent) {
            this.logger.error(
              `E-mail d'accès NON envoyé à ${tenant.email} : réinitialiser le mot de passe de ${tenant.login} dans Axelor.`,
            );
          }
        }
      }

      // 6.5 Création et liaison de la fiche Employé (RH)
      //     nouvelle société : hrManager = true ; rattachement : managerUser = responsable de la société
      let employeeId = tenant.axelorEmployeeId;
      if (!employeeId) {
        this.logger.log(`Création de la fiche employé pour ${tenant.login}...`);
        employeeId = await this.axelor.createEmployee({
          name: tenant.login,
          email: tenant.email,
          companyId,
          contactPartnerId: userPartnerId,
          hrManager: !isJoin,
          managerUserId,
        });
        await this.prisma.tenant.update({ where: { id: tenantId }, data: { axelorEmployeeId: employeeId } });
        // Lier l'utilisateur à l'employé
        await this.axelor.setUserEmployee(userId, employeeId);
      }

      // 7. Mise à jour finale
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { status: "ACTIVE", lastError: null, provisionedAt: tenant.provisionedAt ?? new Date() },
      });
      await this.markJob(jobId, "DONE", job.attemptsMade + 1, null);
      this.logger.log(
        `✓ Provisioning terminé : ${tenant.companyName} (${isJoin ? "rattachement" : "nouvelle société"}, ` +
          `société ${companyId}, groupe ${groupCode}, utilisateur ${userId}, employé ${employeeId})`,
      );
    } catch (error: any) {
      const message: string = error?.message ?? String(error);
      const permanent = error instanceof UnrecoverableError;
      const last = this.isLastAttempt(job);
      this.logger.error(`✗ Provisioning ${tenantId} (tentative ${job.attemptsMade + 1}) : ${message}`);

      await this.markJob(jobId, permanent || last ? "FAILED" : "RETRY", job.attemptsMade + 1, message);
      if ((permanent || last) && !wasActive) {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { status: "FAILED", lastError: message.slice(0, 500) },
        });
        // TODO : alerter l'équipe (e-mail / Slack)
      }
      throw error;
    }
  }

  /** Aligne l'accès Axelor sur le statut ACTUEL du tenant (idempotent, insensible à l'ordre des jobs). */
  private async manageAccess(job: Job<{ tenantId: string; enable: boolean }>) {
    const { tenantId } = job.data;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.axelorUserId) {
      this.logger.warn(`Gestion d'accès ignorée : tenant ${tenantId} sans utilisateur Axelor.`);
      return;
    }
    const shouldBeBlocked = tenant.status === "SUSPENDED" || tenant.status === "CANCELLED";
    const patch: { blocked: boolean; expiresOn?: string } = { blocked: shouldBeBlocked };

    if (tenant.status === "ACTIVE") {
      const { expiresOn } = accessWindow(tenant.currentPeriodEnd, this.graceDays());
      patch.expiresOn = toAxelorDate(expiresOn, this.validityType());
    }
    await this.axelor.setUserAccess(tenant.axelorUserId, patch);
    this.logger.log(
      `Accès Axelor de ${tenant.login} : ${shouldBeBlocked ? "BLOQUÉ" : "actif"}` +
        `${patch.expiresOn ? `, expire le ${patch.expiresOn}` : ""} (statut ${tenant.status})`,
    );
  }
}