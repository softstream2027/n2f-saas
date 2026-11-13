import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BillingService } from "./billing.service";

// billing.controller.ts est SUPPRIMÉ : la route publique POST /api/billing/checkout permettait de
// créer des sessions de paiement pour n'importe quel tenantId. La session est créée par TenantsService.register().
@Module({
  imports: [ConfigModule],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}

