import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Branch, BranchRepository, DealershipRepository } from "@tdm/domain";
import { BRANCH_REPOSITORY, DEALERSHIP_REPOSITORY } from "../infrastructure/tokens";
import { IsRecordId, ParseRecordIdPipe } from "../common/record-id";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { PERMISSIONS } from "./permissions";

class GeoDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

class BranchDetailsDto {
  @IsString()
  name!: string;

  @IsString()
  addressLine1!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsString()
  postalCode!: string;

  @IsString()
  country!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoDto)
  geo?: GeoDto | null;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  operatingHours?: string;

  @IsOptional()
  @IsString()
  managerName?: string;
}

class CreateBranchDto extends BranchDetailsDto {
  /** Fixed for the branch's lifetime — its stock and bookings belong to the same dealership. */
  @IsRecordId()
  dealershipId!: string;
}

class UpdateBranchDto extends BranchDetailsDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

function branchToDto(branch: Branch) {
  const props = branch.toProps();
  return {
    id: props.id,
    dealershipId: props.dealershipId,
    name: props.name,
    address: props.address,
    geo: props.geo,
    phone: props.phone,
    email: props.email,
    operatingHours: props.operatingHours,
    managerName: props.managerName,
    isActive: props.isActive,
  };
}

@Controller("admin/branches")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class AdminBranchesController {
  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
    @Inject(DEALERSHIP_REPOSITORY) private readonly dealerships: DealershipRepository,
  ) {}

  @Get()
  async list(@CurrentStaffAccess() access: StaffAccess) {
    const scope = access.scopeFor(PERMISSIONS.MANAGE_CONFIG) ?? { dealershipIds: [] };
    const branches = await this.branches.findAllIncludingInactive(scope);
    return branches.map(branchToDto);
  }

  @Post()
  async create(@Body() dto: CreateBranchDto, @CurrentStaffAccess() access: StaffAccess) {
    const dealership = await this.dealerships.findById(dto.dealershipId);
    // A dealership outside the admin's scope is indistinguishable from a nonexistent one.
    if (!dealership || !access.canIn(PERMISSIONS.MANAGE_CONFIG, dealership.id)) {
      throw new BadRequestException("Unknown dealership.");
    }
    const branch = Branch.create({
      dealershipId: dealership.id,
      name: dto.name,
      address: {
        line1: dto.addressLine1,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        country: dto.country,
      },
      geo: dto.geo ?? undefined,
      phone: dto.phone,
      email: dto.email,
      operatingHours: dto.operatingHours,
      managerName: dto.managerName,
    });
    const saved = await this.branches.save(branch);
    return branchToDto(saved);
  }

  @Patch(":id")
  async update(
    @Param("id", ParseRecordIdPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentStaffAccess() access: StaffAccess,
  ) {
    const existing = await this.requireBranch(id, access);
    existing.updateDetails({
      name: dto.name,
      address: {
        line1: dto.addressLine1,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        country: dto.country,
      },
      // Omitted geo is kept as-is (the pin feeds nearest-branch search); an explicit null clears it.
      ...(dto.geo !== undefined ? { geo: dto.geo ?? undefined } : {}),
      phone: dto.phone,
      email: dto.email,
      operatingHours: dto.operatingHours,
      managerName: dto.managerName,
      ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
    });
    const saved = await this.branches.save(existing);
    return branchToDto(saved);
  }

  @Patch(":id/deactivate")
  async deactivate(@Param("id", ParseRecordIdPipe) id: string, @CurrentStaffAccess() access: StaffAccess) {
    const existing = await this.requireBranch(id, access);
    existing.deactivate();
    const saved = await this.branches.save(existing);
    return branchToDto(saved);
  }

  @Patch(":id/activate")
  async activate(@Param("id", ParseRecordIdPipe) id: string, @CurrentStaffAccess() access: StaffAccess) {
    const existing = await this.requireBranch(id, access);
    existing.activate();
    const saved = await this.branches.save(existing);
    return branchToDto(saved);
  }

  /** Another dealership's branch is indistinguishable from a nonexistent one. */
  private async requireBranch(id: string, access: StaffAccess): Promise<Branch> {
    const branch = await this.branches.findById(id);
    if (!branch || !access.canIn(PERMISSIONS.MANAGE_CONFIG, branch.dealershipId)) {
      throw new NotFoundException(`Branch ${id} not found.`);
    }
    return branch;
  }
}
