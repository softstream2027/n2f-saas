import { Module } from "@nestjs/common";
import { AxelorService } from "./axelor.service";

/** Une seule instance d'AxelorService (donc une seule session Axelor) pour toute l'application. */
@Module({
  providers: [AxelorService],
  exports: [AxelorService],
})
export class AxelorModule {}
