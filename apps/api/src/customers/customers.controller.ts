import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { AuthenticatedUser, JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { CustomersService } from "./customers.service";
import { AddWishlistItemDto } from "./dto";

class RecommendationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

/** Self-service endpoints for the logged-in customer (wishlist, dashboard, recommendations) — profile CRUD stays on AuthController's /auth/me for now since that's the established convention in this codebase. */
@Controller("customers/me")
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get("dashboard")
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.getDashboard(user.customerId);
  }

  @Get("wishlist")
  listWishlist(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.listWishlist(user.customerId);
  }

  @Post("wishlist")
  addToWishlist(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddWishlistItemDto) {
    return this.customersService.addToWishlist(user.customerId, dto.vehicleId);
  }

  @Delete("wishlist/:vehicleId")
  removeFromWishlist(@CurrentUser() user: AuthenticatedUser, @Param("vehicleId") vehicleId: string) {
    return this.customersService.removeFromWishlist(user.customerId, vehicleId);
  }

  @Get("recommendations")
  getRecommendations(@CurrentUser() user: AuthenticatedUser, @Query() query: RecommendationsQueryDto) {
    return this.customersService.getRecommendations(user.customerId, query.limit);
  }
}
