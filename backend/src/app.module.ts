import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { BullModule } from "@nestjs/bullmq";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { cfg } from "./config";
import { CoreModule } from "./core/core.module";
import { ProvisioningModule } from "./provisioning/provisioning.module";
import { TenantsModule } from "./tenants/tenants.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { BillingModule } from "./billing/billing.module"; // ?? Ajoutez ceci

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    BullModule.forRoot({ connection: { url: cfg.redisUrl } }),
    CoreModule,
    ProvisioningModule,
    TenantsModule,
    WebhooksModule,
 BillingModule, 
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
