import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule } from "@nestjs/config";
import { ProvisioningService } from "./provisioning.service";
import { ProvisioningProcessor } from "./provisioning.processor";

// PrismaService et AxelorService viennent de CoreModule (global) : plus de copies locales.
@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: "provisioning" })],
  providers: [ProvisioningService, ProvisioningProcessor],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}

