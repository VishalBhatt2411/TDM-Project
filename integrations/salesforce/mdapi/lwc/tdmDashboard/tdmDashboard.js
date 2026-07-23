import { LightningElement, wire } from "lwc";
import getKpis from "@salesforce/apex/TDMDashboardController.getKpis";
import getStatusBreakdown from "@salesforce/apex/TDMDashboardController.getStatusBreakdown";
import getUpcomingBookings from "@salesforce/apex/TDMDashboardController.getUpcomingBookings";
import getRepLeaderboard from "@salesforce/apex/TDMDashboardController.getRepLeaderboard";

const STATUS_COLORS = {
  Requested: "#e59700",
  Confirmed: "#1b96ff",
  Waitlisted: "#8b6f2e",
  InProgress: "#8850d9",
  Completed: "#04844b",
  Cancelled: "#706e6b",
  NoShow: "#ea001e",
};

const UPCOMING_COLUMNS = [
  { label: "Booking", fieldName: "bookingNumber", type: "text" },
  { label: "Customer", fieldName: "customerName", type: "text" },
  { label: "Vehicle", fieldName: "vehicleName", type: "text" },
  { label: "Sales Rep", fieldName: "repName", type: "text" },
  { label: "Branch", fieldName: "branchName", type: "text" },
  { label: "Scheduled", fieldName: "scheduledStart", type: "date", typeAttributes: { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" } },
  { label: "Drive Type", fieldName: "driveType", type: "text" },
  { label: "Status", fieldName: "status", type: "text" },
];

const REP_COLUMNS = [
  { label: "Sales Rep", fieldName: "repName", type: "text" },
  { label: "Total Bookings", fieldName: "totalBookings", type: "number", cellAttributes: { alignment: "left" } },
  { label: "Completed", fieldName: "completed", type: "number", cellAttributes: { alignment: "left" } },
  { label: "Conversion Rate", fieldName: "conversionRateLabel", type: "text" },
];

export default class TdmDashboard extends LightningElement {
  kpis;
  statusBreakdown = [];
  upcomingBookings = [];
  repLeaderboard = [];
  error;

  upcomingColumns = UPCOMING_COLUMNS;
  repColumns = REP_COLUMNS;

  @wire(getKpis)
  wiredKpis({ data, error }) {
    if (data) this.kpis = data;
    if (error) this.error = error;
  }

  @wire(getStatusBreakdown)
  wiredStatusBreakdown({ data, error }) {
    if (data) {
      const max = Math.max(...data.map((row) => row.count), 1);
      this.statusBreakdown = data.map((row) => ({
        ...row,
        barStyle: `width: ${Math.round((row.count / max) * 100)}%; background-color: ${STATUS_COLORS[row.status] ?? "#1b96ff"};`,
      }));
    }
    if (error) this.error = error;
  }

  @wire(getUpcomingBookings, { maxRows: 8 })
  wiredUpcoming({ data, error }) {
    if (data) this.upcomingBookings = data;
    if (error) this.error = error;
  }

  @wire(getRepLeaderboard)
  wiredLeaderboard({ data, error }) {
    if (data) {
      this.repLeaderboard = data.map((row) => ({ ...row, conversionRateLabel: `${row.conversionRate}%` }));
    }
    if (error) this.error = error;
  }

  get hasStatusBreakdown() {
    return this.statusBreakdown.length > 0;
  }

  get hasUpcomingBookings() {
    return this.upcomingBookings.length > 0;
  }

  get hasRepLeaderboard() {
    return this.repLeaderboard.length > 0;
  }

  get avgNpsDisplay() {
    return this.kpis?.avgNps == null ? "—" : this.kpis.avgNps;
  }
}
