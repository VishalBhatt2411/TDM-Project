import { Address, GeoCoordinates } from "../value-objects";

export interface BranchProps {
  id: string;
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

  get id() {
    return this.props.id;
  }
  get isActive() {
    return this.props.isActive;
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
