import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { WebhooksController } from "./webhooks.controller";
import { ProvisioningModule } from "../provisioning/provisioning.module";

@Module({
  imports: [ConfigModule, ProvisioningModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}

