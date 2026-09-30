import { Address, GeoCoordinates } from "../value-objects";
import { UNASSIGNED_ID } from "./booking";

export interface BranchProps {
  id: string;
  /** The dealership that owns this branch — fixed once created; its vehicles and bookings belong to the same one. */
  dealershipId: string;
  name: string;
  address: Address;
  geo?: GeoCoordinates;
  phone?: string;
  email?: string;
  operatingHours?: string;
  managerName?: string;
  isActive: boolean;
}

export class Branch {
  private constructor(private props: BranchProps) {}

  static restore(props: BranchProps): Branch {
    return new Branch(props);
  }

  /** A new branch has no identity until the repository persists it and assigns one. */
  static create(props: Omit<BranchProps, "id" | "isActive">): Branch {
    return new Branch({ ...props, id: UNASSIGNED_ID, isActive: true });
  }

  get id() {
    return this.props.id;
  }
  get dealershipId() {
    return this.props.dealershipId;
  }
  get isActive() {
    return this.props.isActive;
  }

  updateDetails(patch: Partial<Omit<BranchProps, "id" | "dealershipId">>): void {
    this.props = { ...this.props, ...patch };
  }

  deactivate(): void {
    this.props.isActive = false;
  }

  activate(): void {
    this.props.isActive = true;
  }

  toProps(): BranchProps {
    return { ...this.props };
  }
}

export interface SalesRepProps {
  /** The rep's real Salesforce User Id — this is what a Booking is assigned to (Booking__c.OwnerId). */
  id: string;
  name: string;
  email: string;
  phone?: string;
  dealershipId?: string;
  branchId?: string;
  isActive: boolean;
  maxDailyBookings?: number;
}

export class SalesRepresentative {
  private constructor(private props: SalesRepProps) {}

  static restore(props: SalesRepProps): SalesRepresentative {
    return new SalesRepresentative(props);
  }

  get id() {
    return this.props.id;
  }
  get branchId() {
    return this.props.branchId;
  }
  get isActive() {
    return this.props.isActive;
  }

  toProps(): SalesRepProps {
    return { ...this.props };
  }
}
