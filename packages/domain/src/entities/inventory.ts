import { UNASSIGNED_ID } from "./booking";

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

  /** A new transfer request has no identity until the repository persists it and assigns one. */
  static request(input: { vehicleId: string; fromBranchId?: string; toBranchId: string; transferDate?: Date }): VehicleAllocation {
    return new VehicleAllocation({ ...input, id: UNASSIGNED_ID, status: "Requested" });
  }

  static restore(props: VehicleAllocationProps): VehicleAllocation {
    return new VehicleAllocation(props);
  }

  get id() {
    return this.props.id;
  }
  get status() {
    return this.props.status;
  }

  markInTransit(): void {
    this.props.status = "In_Transit";
  }

  complete(): void {
    this.props.status = "Completed";
  }

  cancel(): void {
    this.props.status = "Cancelled";
  }

  toProps(): VehicleAllocationProps {
    return { ...this.props };
  }
}
