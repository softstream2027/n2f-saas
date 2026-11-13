import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PrismaService } from "../core/prisma.service";

@Injectable()
export class BillingService {
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.get<string>("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-02-24.acacia",
    });
  }

  private getPriceId(plan: string) {
    const map: Record<string, string | undefined> = {
      starter: this.config.get("STRIPE_PRICE_STARTER"),
      business: this.config.get("STRIPE_PRICE_BUSINESS"),
      production: this.config.get("STRIPE_PRICE_PRODUCTION"),
    };
    if (!map[plan]) throw new NotFoundException(`Plan inconnu : ${plan}`);
    return map[plan];
  }

  async createCheckoutSession(tenantId: string, plan: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException("Client introuvable.");

    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        name: tenant.companyName,
        email: tenant.email,
        metadata: { tenantId: tenant.id },
      });
      customerId = customer.id;
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: this.getPriceId(plan), quantity: 1 }],
      success_url: `${this.config.get("FRONTEND_URL")}/success?tenantId=${tenant.id}`,
      cancel_url: `${this.config.get("FRONTEND_URL")}/`,
      metadata: { tenantId: tenant.id, plan },
      subscription_data: {
        metadata: { tenantId: tenant.id, plan },
      },
    });

    return session.url;
  }
}