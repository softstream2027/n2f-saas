import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "./prisma.module";
import { AxelorModule } from "../axelor/axelor.module";
import { MailService } from "../mail/mail.service";

@Global()
@Module({
  imports: [PrismaModule, AxelorModule],
  providers: [MailService],
  exports: [PrismaModule, AxelorModule, MailService],
})
export class CoreModule {}

