import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";
import { ProvisioningModule } from "../provisioning/provisioning.module";
import { BillingModule } from "../billing/billing.module";

// PrismaService et AxelorService viennent de CoreModule (global).
@Module({
  imports: [ConfigModule, ProvisioningModule, BillingModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}

