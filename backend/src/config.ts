import "dotenv/config";

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Variable d'environnement manquante : ${key}`);
  return value;
};

export const cfg = {
  port: Number(process.env.PORT ?? 4000),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  redisUrl: required("REDIS_URL"),
  secretKey: required("APP_SECRET_KEY"),
  stripe: {
    secretKey: required("STRIPE_SECRET_KEY"),
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    publicKey: required("NEXT_PUBLIC_STRIPE_PUBLIC_KEY"),
    priceIds: {
      starter: required("STRIPE_PRICE_STARTER"),
      business: required("STRIPE_PRICE_BUSINESS"),
      production: required("STRIPE_PRICE_PRODUCTION"),
    },
  },
  axelor: {
    baseUrl: required("AXELOR_BASE_URL"),
    username: required("AXELOR_USERNAME"),
    password: required("AXELOR_PASSWORD"),
    groupCode: process.env.AXELOR_CLIENT_GROUP_USER ?? "CLIENT_ADMIN",
    groupUser: process.env.AXELOR_CLIENT_GROUP_USER ?? "mobile.hr",
   groupManager: process.env.AXELOR_CLIENT_GROUP_MANAGER ?? "HRM",
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? "SoftStream <no-reply@localhost>",
  },
};

export const PLAN_KEYS = ["starter", "business", "production"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];
export const stripePlanId = (plan: string) => cfg.stripe.priceIds[plan as PlanKey];

// Devise de la société dans Axelor (≠ devise de facturation Stripe)
export const currencyForCountry = (country: string) =>
  ({ TN: "TND", CH: "CHF" } as Record<string, string>)[country] ?? "EUR";
