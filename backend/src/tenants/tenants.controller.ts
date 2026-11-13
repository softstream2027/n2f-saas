import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { TenantsService } from "./tenants.service";
import { RegisterDto } from "./tenants.dto";

@Controller("api/signup")
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get("company")
  async resolveCompany(@Query("taxId") taxId: string, @Query("login") login?: string) {
    return this.tenants.resolveCompanyByTaxId(taxId ?? "", login ?? "");
  }

  @Post()
  async register(@Body() dto: RegisterDto) {
    return this.tenants.register(dto);
  }

  @Get(":id/status")
  async status(@Param("id") id: string) {
    return this.tenants.status(id);
  }
}
