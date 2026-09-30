import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  CompareVehiclesDto,
  EmiEstimateDto,
  FeaturedVehiclesQueryDto,
  VehicleAvailabilityQueryDto,
  VehicleSearchQueryDto,
} from "./dto";
import { ParseRecordIdPipe } from "../common/record-id";
import { VehiclesService } from "./vehicles.service";

@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  search(@Query() query: VehicleSearchQueryDto) {
    return this.vehiclesService.search(query);
  }

  @Get("featured")
  getFeatured(@Query() query: FeaturedVehiclesQueryDto) {
    const { kind, ...location } = query;
    return this.vehiclesService.getFeatured(kind, location);
  }

  @Post("compare")
  compare(@Body() dto: CompareVehiclesDto) {
    return this.vehiclesService.compare(dto.vehicleIds);
  }

  @Post("emi-estimate")
  estimateEmi(@Body() dto: EmiEstimateDto) {
    return this.vehiclesService.estimateEmi(dto);
  }

  @Get(":id")
  getById(@Param("id", ParseRecordIdPipe) id: string) {
    return this.vehiclesService.getById(id);
  }

  @Get(":id/variants")
  getVariants(@Param("id", ParseRecordIdPipe) id: string) {
    return this.vehiclesService.getVariants(id);
  }

  @Get(":id/related")
  getRelated(@Param("id", ParseRecordIdPipe) id: string) {
    return this.vehiclesService.getRelated(id);
  }

  @Get(":id/availability")
  getAvailability(@Param("id", ParseRecordIdPipe) id: string, @Query() query: VehicleAvailabilityQueryDto) {
    return this.vehiclesService.getAvailability(id, query.date);
  }
}
