import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ComplianceService } from "./compliance.service";
import { SubmitComplianceDto } from "./dto";

@Controller("bookings")
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get(":id/compliance")
  getStatus(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.complianceService.getStatus(user.customerId, id);
  }

  @Post(":id/compliance")
  submit(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: SubmitComplianceDto) {
    return this.complianceService.submit(user.customerId, id, dto);
  }
}
