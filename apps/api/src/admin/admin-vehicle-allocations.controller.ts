import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString } from "class-validator";
import { BranchRepository, VehicleAllocation, VehicleAllocationRepository, VehicleRepository } from "@tdm/domain";
import { BRANCH_REPOSITORY, VEHICLE_ALLOCATION_REPOSITORY, VEHICLE_REPOSITORY } from "../infrastructure/tokens";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";

const STATUSES = ["Requested", "In_Transit", "Completed", "Cancelled"];

class CreateAllocationDto {
  @IsString()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  fromBranchId?: string;

  @IsString()
  toBranchId!: string;
}

class ListAllocationsQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;
}

function allocationToDto(allocation: VehicleAllocation) {
  const props = allocation.toProps();
  return {
    id: props.id,
    vehicleId: props.vehicleId,
    fromBranchId: props.fromBranchId,
    toBranchId: props.toBranchId,
    transferDate: props.transferDate?.toISOString(),
    status: props.status,
  };
}

@Controller("admin/vehicle-allocations")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class AdminVehicleAllocationsController {
  constructor(
    @Inject(VEHICLE_ALLOCATION_REPOSITORY) private readonly allocations: VehicleAllocationRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
  ) {}

  @Get()
  async list(@Query() query: ListAllocationsQueryDto) {
    const items = await this.allocations.findAll({ status: query.status as VehicleAllocation["status"] | undefined });
    return items.map(allocationToDto);
  }

  @Post()
  async create(@Body() dto: CreateAllocationDto) {
    if (!(await this.branches.findById(dto.toBranchId))) throw new BadRequestException("Unknown destination branch.");
    const allocation = VehicleAllocation.request({
      vehicleId: dto.vehicleId,
      fromBranchId: dto.fromBranchId,
      toBranchId: dto.toBranchId,
    });
    const saved = await this.allocations.save(allocation);
    return allocationToDto(saved);
  }

  @Patch(":id/transit")
  async markInTransit(@Param("id") id: string) {
    const existing = await this.allocations.findById(id);
    if (!existing) throw new NotFoundException(`Vehicle allocation ${id} not found.`);
    existing.markInTransit();
    const saved = await this.allocations.save(existing);
    return allocationToDto(saved);
  }

  @Patch(":id/complete")
  async complete(@Param("id") id: string) {
    const existing = await this.allocations.findById(id);
    if (!existing) throw new NotFoundException(`Vehicle allocation ${id} not found.`);
    existing.complete();
    const saved = await this.allocations.save(existing);

    const props = saved.toProps();
    const [vehicle, toBranch] = await Promise.all([
      this.vehicles.findById(props.vehicleId),
      this.branches.findById(props.toBranchId),
    ]);
    if (vehicle && toBranch) {
      vehicle.moveToBranch(toBranch.id, toBranch.dealershipId);
      await this.vehicles.save(vehicle);
    }

    return allocationToDto(saved);
  }

  @Patch(":id/cancel")
  async cancel(@Param("id") id: string) {
    const existing = await this.allocations.findById(id);
    if (!existing) throw new NotFoundException(`Vehicle allocation ${id} not found.`);
    existing.cancel();
    const saved = await this.allocations.save(existing);
    return allocationToDto(saved);
  }
}
