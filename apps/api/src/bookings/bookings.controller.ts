import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { BookingsService } from "./bookings.service";
import { CancelBookingDto, CreateBookingDto, CreatePublicBookingDto, RescheduleBookingDto, SubmitSurveyDto } from "./dto";

@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /** Primary entry point for first-time visitors — no account needed up front. */
  @Post("public")
  createPublic(@Body() dto: CreatePublicBookingDto) {
    return this.bookingsService.createPublic(dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.customerId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.listForCustomer(user.customerId);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  getById(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.bookingsService.getById(user.customerId, id);
  }

  @Post(":id/cancel")
  @UseGuards(JwtAuthGuard)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CancelBookingDto) {
    return this.bookingsService.cancel(user.customerId, id, dto);
  }

  @Post(":id/reschedule")
  @UseGuards(JwtAuthGuard)
  reschedule(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RescheduleBookingDto) {
    return this.bookingsService.reschedule(user.customerId, id, dto);
  }

  @Post(":id/survey")
  @UseGuards(JwtAuthGuard)
  submitSurvey(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: SubmitSurveyDto) {
    return this.bookingsService.submitSurvey(user.customerId, id, dto);
  }
}
