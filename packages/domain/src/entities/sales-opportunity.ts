export type OpportunityStage = "Identified" | "Pursuing" | "Won" | "Lost";

export interface SalesOpportunityProps {
  id: string;
  bookingId: string;
  customerId: string;
  vehicleId: string;
  stage: OpportunityStage;
  createdAt: Date;
}

export const UNASSIGNED_OPPORTUNITY_ID = "__unassigned__";

export class SalesOpportunity {
  private constructor(private props: SalesOpportunityProps) {}

  /** id is optional — assigned by the repository once the provider creates the record. */
  static create(input: { id?: string; bookingId: string; customerId: string; vehicleId: string }): SalesOpportunity {
    return new SalesOpportunity({
      id: input.id ?? UNASSIGNED_OPPORTUNITY_ID,
      bookingId: input.bookingId,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      stage: "Identified",
      createdAt: new Date(),
    });
  }

  static restore(props: SalesOpportunityProps): SalesOpportunity {
    return new SalesOpportunity(props);
  }

  withAssignedId(id: string): SalesOpportunity {
    return SalesOpportunity.restore({ ...this.props, id });
  }

  get id() {
    return this.props.id;
  }
  get bookingId() {
    return this.props.bookingId;
  }
  get customerId() {
    return this.props.customerId;
  }
  get vehicleId() {
    return this.props.vehicleId;
  }
  get stage() {
    return this.props.stage;
  }

  toProps(): SalesOpportunityProps {
    return { ...this.props };
  }
}
