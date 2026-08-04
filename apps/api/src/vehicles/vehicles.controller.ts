import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { EmiEstimateRequest } from "@tdm/types";
import { VehicleSearchQueryDto } from "./dto";
import { VehiclesService } from "./vehicles.service";

export class CompareVehiclesDto {
  vehicleIds!: string[];
}

@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  search(@Query() query: VehicleSearchQueryDto) {
    return this.vehiclesService.search(query);
  }

  @Get("featured")
  getFeatured(@Query("kind") kind: "featured" | "bestSeller" | "newLaunch" = "featured") {
    return this.vehiclesService.getFeatured(kind);
  }

  @Post("compare")
  compare(@Body() dto: CompareVehiclesDto) {
    return this.vehiclesService.compare(dto.vehicleIds.slice(0, 4));
  }

  @Post("emi-estimate")
  estimateEmi(@Body() dto: EmiEstimateRequest) {
    return this.vehiclesService.estimateEmi(dto);
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.vehiclesService.getById(id);
  }

  @Get(":id/variants")
  getVariants(@Param("id") id: string) {
    return this.vehiclesService.getVariants(id);
  }

  @Get(":id/related")
  getRelated(@Param("id") id: string) {
    return this.vehiclesService.getRelated(id);
  }
}
