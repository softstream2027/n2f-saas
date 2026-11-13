import { Controller, Post, Req, Headers, BadRequestException, Logger, RawBodyRequest } from "@nestjs/common";
import { Request } from "express";
import Stripe from "stripe";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../core/prisma.service";
import { ProvisioningService } from "../provisioning/provisioning.service";

const str = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && "id" in (v as any) ? String((v as any).id) : null;

@Controller("api/webhooks")
export class WebhooksController {
  private readonly log = new Logger(WebhooksController.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly provisioning: ProvisioningService,
  ) {
    this.stripe = new Stripe(this.config.get<string>("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-02-24.acacia",
    });
  }

  @Post("stripe")
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string,
  ) {
    // Corps brut (express.raw() doit être appliqué à cette route dans main.ts)
    const rawBody = req.body;
    if (!rawBody) throw new BadRequestException("Corps brut Stripe manquant.");

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.get<string>("STRIPE_WEBHOOK_SECRET")!,
      );
    } catch (err: any) {
      this.log.error(`Signature Stripe invalide : ${err.message}`);
      throw new BadRequestException("Signature Stripe invalide.");
    }

    // Idempotence : un événement déjà traité (rejeu Stripe) est ignoré.
    try {
      await this.prisma.webhookEvent.create({ data: { id: event.id, type: event.type } });
    } catch (e: any) {
      if (e?.code === "P2002") {
        this.log.warn(`Événement déjà traité, ignoré : ${event.id} (${event.type})`);
        return { received: true, duplicate: true };
      }
      throw e;
    }

    this.log.log(`Événement Stripe reçu : ${event.type} (${event.id})`);

    try {
      await this.dispatch(event);
    } catch (err) {
      // On "libère" l'événement pour que le nouvel envoi de Stripe soit retraité, puis on répond 500.
      await this.prisma.webhookEvent.delete({ where: { id: event.id } }).catch(() => undefined);
      throw err;
    }
    return { received: true };
  }

  /** Fin de la période payée d'un abonnement (mensuel, trimestriel, semestriel ou annuel : Stripe le sait). */
  private async periodEnd(subscriptionId: string | null): Promise<Date | null> {
    if (!subscriptionId) return null;
    try {
      const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
      return sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
    } catch (e) {
      this.log.warn(`Période de l'abonnement ${subscriptionId} illisible : ${(e as Error).message}`);
      return null;
    }
  }

  private async findTenant(ids: { tenantId?: string | null; subscriptionId?: string | null; customerId?: string | null }) {
    if (ids.tenantId) {
      const t = await this.prisma.tenant.findUnique({ where: { id: ids.tenantId } });
      if (t) return t;
    }
    if (ids.subscriptionId) {
      const t = await this.prisma.tenant.findUnique({ where: { stripeSubscriptionId: ids.subscriptionId } });
      if (t) return t;
    }
    if (ids.customerId) {
      const t = await this.prisma.tenant.findUnique({ where: { stripeCustomerId: ids.customerId } });
      if (t) return t;
    }
    return null;
  }

  private async dispatch(event: Stripe.Event) {
    switch (event.type) {
      // ----- Paiement initial confirmé -> provisioning -----
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        if (session.payment_status === "unpaid") {
          this.log.log(`Session ${session.id} en attente de paiement : pas de provisioning.`);
          break;
        }
        const tenant = await this.findTenant({
          tenantId: session.metadata?.tenantId,
          customerId: str(session.customer),
        });
        if (!tenant) {
          this.log.error(`Paiement reçu (session ${session.id}) mais aucun tenant correspondant : à traiter à la main.`);
          break;
        }
        const subscriptionId = str(session.subscription) ?? tenant.stripeSubscriptionId;
        const currentPeriodEnd = await this.periodEnd(subscriptionId);
        const res = await this.prisma.tenant.updateMany({
          where: { id: tenant.id, status: { in: ["PENDING_PAYMENT", "PAID", "FAILED"] } },
          data: {
            status: "PROVISIONING",
            stripeSubscriptionId: subscriptionId,
            ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
          },
        });
        if (res.count === 1) {
          await this.provisioning.enqueueProvision(tenant.id);
          this.log.log(`Provisioning lancé pour le tenant ${tenant.id}`);
        }
        break;
      }

      // ----- Premier échec de paiement : délai de grâce, l'accès est conservé -----
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = str(invoice.customer);
        if (customerId) {
          await this.prisma.tenant.updateMany({
            where: { stripeCustomerId: customerId, status: "ACTIVE" },
            data: { status: "PAST_DUE" },
          });
          this.log.warn(`Paiement échoué pour le client Stripe ${customerId} : statut PAST_DUE`);
        }
        break;
      }

      // ----- Paiement régularisé : on rétablit l'accès -----
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const tenant = await this.findTenant({ customerId: str(invoice.customer) });
        if (!tenant) break;

        // Renouvellement payé : on enregistre la nouvelle fin de période.
        const currentPeriodEnd = await this.periodEnd(tenant.stripeSubscriptionId);
        if (currentPeriodEnd) {
          await this.prisma.tenant.update({ where: { id: tenant.id }, data: { currentPeriodEnd } });
        }
        if (tenant.status === "PAST_DUE" || tenant.status === "SUSPENDED") {
          await this.prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
          //await this.provisioning.enqueueAccess(tenant.id, true);
          this.log.log(`Paiement régularisé : accès rétabli pour ${tenant.id}`);
        }
        // Aligne l'accès Axelor (déblocage et/ou nouvelle date d'expiration) sur le statut courant.
        if (tenant.axelorUserId) {
          await this.provisioning.enqueueAccess(tenant.id, true);
        }
        break;
      }

      // ----- Changements d'état de l'abonnement -----
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const tenant = await this.findTenant({
          tenantId: sub.metadata?.tenantId,
          subscriptionId: sub.id,
          customerId: str(sub.customer),
        });
        if (!tenant) break;

        const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
        const periodChanged = currentPeriodEnd?.getTime() !== tenant.currentPeriodEnd?.getTime();
        await this.prisma.tenant.update({ where: { id: tenant.id }, data: { currentPeriodEnd } });
        if (periodChanged && tenant.status === "ACTIVE" && tenant.axelorUserId) {
          await this.provisioning.enqueueAccess(tenant.id, true); // renouvellement : repousse expiresOn
        }

        if ((sub.status === "active" || sub.status === "trialing") &&
            (tenant.status === "PAST_DUE" || tenant.status === "SUSPENDED")) {
          await this.prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
          await this.provisioning.enqueueAccess(tenant.id, true);
        } else if (sub.status === "past_due" && tenant.status === "ACTIVE") {
          await this.prisma.tenant.update({ where: { id: tenant.id }, data: { status: "PAST_DUE" } });
        } else if (
          (sub.status === "unpaid" || sub.status === "canceled" || sub.status === "incomplete_expired") &&
          tenant.status !== "CANCELLED" && tenant.status !== "SUSPENDED"
        ) {
          await this.prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });
          await this.provisioning.enqueueAccess(tenant.id, false);
          this.log.warn(`Abonnement ${sub.status} : accès Axelor bloqué pour ${tenant.id}`);
        }
        break;
      }

      // ----- Abonnement terminé -----
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const tenant = await this.findTenant({
          tenantId: sub.metadata?.tenantId,
          subscriptionId: sub.id,
          customerId: str(sub.customer),
        });
        if (tenant && tenant.status !== "CANCELLED") {
          await this.prisma.tenant.update({ where: { id: tenant.id }, data: { status: "CANCELLED" } });
          await this.provisioning.enqueueAccess(tenant.id, false);
          this.log.warn(`Abonnement annulé : accès Axelor bloqué pour ${tenant.id}`);
        }
        break;
      }

      default:
        break;
    }
  }
}
