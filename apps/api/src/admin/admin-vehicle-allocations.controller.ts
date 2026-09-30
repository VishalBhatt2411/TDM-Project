import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import { BranchRepository, VehicleAllocation, VehicleAllocationRepository, VehicleRepository } from "@tdm/domain";
import { BRANCH_REPOSITORY, VEHICLE_ALLOCATION_REPOSITORY, VEHICLE_REPOSITORY } from "../infrastructure/tokens";
import { IsRecordId, ParseRecordIdPipe } from "../common/record-id";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { PERMISSIONS } from "./permissions";

const STATUSES = ["Requested", "In_Transit", "Completed", "Cancelled"];

class CreateAllocationDto {
  @IsRecordId()
  vehicleId!: string;

  /** Where the client saw the vehicle — rejected if it has moved since. The vehicle's current branch is what's recorded. */
  @IsOptional()
  @IsRecordId()
  fromBranchId?: string;

  @IsRecordId()
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
  async list(@Query() query: ListAllocationsQueryDto, @CurrentStaffAccess() access: StaffAccess) {
    const scope = access.scopeFor(PERMISSIONS.MANAGE_CONFIG) ?? { dealershipIds: [] };
    const items = await this.allocations.findAll({ status: query.status as VehicleAllocation["status"] | undefined, ...scope });
    return items.map(allocationToDto);
  }

  @Post()
  async create(@Body() dto: CreateAllocationDto, @CurrentStaffAccess() access: StaffAccess) {
    const [vehicle, toBranch] = await Promise.all([this.vehicles.findById(dto.vehicleId), this.branches.findById(dto.toBranchId)]);
    // Either end outside the admin's dealerships is indistinguishable from a nonexistent one.
    if (!vehicle || !access.canIn(PERMISSIONS.MANAGE_CONFIG, vehicle.dealershipId)) {
      throw new BadRequestException("Unknown vehicle.");
    }
    if (!toBranch || !access.canIn(PERMISSIONS.MANAGE_CONFIG, toBranch.dealershipId)) {
      throw new BadRequestException("Unknown destination branch.");
    }
    if (dto.fromBranchId && dto.fromBranchId !== vehicle.branchId) {
      throw new BadRequestException("That vehicle is no longer at the source branch — refresh and try again.");
    }
    if (toBranch.id === vehicle.branchId) throw new BadRequestException("The vehicle is already at that branch.");
    const allocation = VehicleAllocation.request({
      vehicleId: vehicle.id,
      fromBranchId: vehicle.branchId,
      toBranchId: toBranch.id,
    });
    const saved = await this.allocations.save(allocation);
    return allocationToDto(saved);
  }

  @Patch(":id/transit")
  async markInTransit(@Param("id", ParseRecordIdPipe) id: string, @CurrentStaffAccess() access: StaffAccess) {
    const existing = await this.requireAllocation(id, access);
    existing.markInTransit();
    const saved = await this.allocations.save(existing);
    return allocationToDto(saved);
  }

  @Patch(":id/complete")
  async complete(@Param("id", ParseRecordIdPipe) id: string, @CurrentStaffAccess() access: StaffAccess) {
    const existing = await this.requireAllocation(id, access);
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
  async cancel(@Param("id", ParseRecordIdPipe) id: string, @CurrentStaffAccess() access: StaffAccess) {
    const existing = await this.requireAllocation(id, access);
    existing.cancel();
    const saved = await this.allocations.save(existing);
    return allocationToDto(saved);
  }

  /**
   * Visible — and actionable — to an admin at either end of the transfer, matching the list;
   * otherwise indistinguishable from a nonexistent one.
   */
  private async requireAllocation(id: string, access: StaffAccess): Promise<VehicleAllocation> {
    const allocation = await this.allocations.findById(id);
    if (allocation) {
      const { fromBranchId, toBranchId } = allocation.toProps();
      const ends = await Promise.all(
        [toBranchId, fromBranchId].filter((b): b is string => !!b).map((b) => this.branches.findById(b)),
      );
      if (ends.some((b) => b && access.canIn(PERMISSIONS.MANAGE_CONFIG, b.dealershipId))) return allocation;
    }
    throw new NotFoundException(`Vehicle allocation ${id} not found.`);
  }
}
