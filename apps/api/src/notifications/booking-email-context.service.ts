import { Inject, Injectable } from "@nestjs/common";
import { Booking, BranchRepository, CustomerRepository, SalesRepRepository, VehicleRepository } from "@tdm/domain";
import { BRANCH_REPOSITORY, CUSTOMER_REPOSITORY, SALES_REP_REPOSITORY, VEHICLE_REPOSITORY } from "../infrastructure/tokens";
import { BookingEmailContext } from "./email-templates";

/** Assembles the shared template context (vehicle/branch/rep/customer labels) every booking email needs. */
@Injectable()
export class BookingEmailContextService {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
    @Inject(SALES_REP_REPOSITORY) private readonly salesReps: SalesRepRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
  ) {}

  async build(booking: Booking, customerNameOverride?: string): Promise<BookingEmailContext | null> {
    const [vehicle, branch, rep, customer] = await Promise.all([
      this.vehicles.findById(booking.vehicleId),
      this.branches.findById(booking.branchId),
      booking.salesRepId ? this.salesReps.findById(booking.salesRepId) : Promise.resolve(null),
      customerNameOverride ? Promise.resolve(null) : this.customers.findById(booking.customerId),
    ]);
    if (!vehicle || !branch) return null;

    const vehicleProps = vehicle.toProps();
    const branchProps = branch.toProps();
    return {
      customerName: customerNameOverride ?? (customer ? `${customer.name.firstName} ${customer.name.lastName}` : "there"),
      vehicleLabel: `${vehicleProps.year} ${vehicleProps.make} ${vehicleProps.model}`,
      bookingReference: booking.id,
      scheduledStart: booking.slot.start,
      driveType: booking.toProps().driveType,
      branchName: branchProps.name,
      branchAddress: branchProps.address.line1,
      salesRepName: rep ? rep.toProps().name : undefined,
    };
  }
}
