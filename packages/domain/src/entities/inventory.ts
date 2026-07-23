export interface WishlistItemProps {
  id: string;
  customerId: string;
  vehicleId: string;
  createdAt: Date;
}

export class WishlistItem {
  private constructor(private props: WishlistItemProps) {}

  static create(props: WishlistItemProps): WishlistItem {
    return new WishlistItem(props);
  }

  toProps(): WishlistItemProps {
    return { ...this.props };
  }
}

export type AllocationStatus = "Requested" | "In_Transit" | "Completed" | "Cancelled";

export interface VehicleAllocationProps {
  id: string;
  vehicleId: string;
  fromBranchId?: string;
  toBranchId: string;
  transferDate?: Date;
  status: AllocationStatus;
}

export class VehicleAllocation {
  private constructor(private props: VehicleAllocationProps) {}

  static request(input: { id: string; vehicleId: string; fromBranchId?: string; toBranchId: string }): VehicleAllocation {
    return new VehicleAllocation({ ...input, status: "Requested" });
  }

  static restore(props: VehicleAllocationProps): VehicleAllocation {
    return new VehicleAllocation(props);
  }

  complete(): void {
    this.props.status = "Completed";
  }

  toProps(): VehicleAllocationProps {
    return { ...this.props };
  }
}
