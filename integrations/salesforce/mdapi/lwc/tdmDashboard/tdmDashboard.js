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

// A rep already knows every drive listed is theirs, so the "Sales Rep" column is dead
// weight — their columns lead with who they're meeting and how to reach them instead.
const REP_UPCOMING_COLUMNS = [
  { label: "Booking", fieldName: "bookingNumber", type: "text" },
  { label: "Customer", fieldName: "customerName", type: "text" },
  { label: "Phone", fieldName: "customerPhone", type: "phone" },
  { label: "Vehicle", fieldName: "vehicleName", type: "text" },
  { label: "Scheduled", fieldName: "scheduledStart", type: "date", typeAttributes: { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" } },
  { label: "Drive Type", fieldName: "driveType", type: "text" },
  { label: "Status", fieldName: "status", type: "text" },
];

const MANAGER_UPCOMING_COLUMNS = [
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

  /** Apex decides this from the running user's effective permissions, not their role name. */
  get isPersonalView() {
    return this.kpis?.isPersonalView === true;
  }

  get headline() {
    return this.isPersonalView ? "My Test Drives" : "Test Drive Management";
  }

  get subtitle() {
    return this.isPersonalView
      ? "Your assigned drives, upcoming schedule, and how your customers rated them."
      : "Live booking activity, sales rep performance, and drive outcomes.";
  }

  /** Labelled per audience so a rep is never left guessing whose numbers these are. */
  get labels() {
    const mine = this.isPersonalView;
    return {
      drivesToday: mine ? "My Drives Today" : "Drives Today",
      upcoming: mine ? "My Upcoming" : "Upcoming",
      completedThisMonth: mine ? "My Completed (Month)" : "Completed (Month)",
      cancelledThisMonth: mine ? "My Cancelled / No-Show (Month)" : "Cancelled / No-Show (Month)",
      completionRate: mine ? "My Completion Rate" : "Completion Rate",
      avgNps: mine ? "My Avg NPS" : "Avg NPS",
      statusBreakdown: mine ? "My Bookings by Status" : "Bookings by Status",
      upcomingList: mine ? "My Upcoming Test Drives" : "Upcoming Test Drives",
    };
  }

  get upcomingColumns() {
    return this.isPersonalView ? REP_UPCOMING_COLUMNS : MANAGER_UPCOMING_COLUMNS;
  }

  get emptyStatusMessage() {
    return this.isPersonalView ? "No drives assigned to you yet." : "No bookings yet.";
  }

  get emptyUpcomingMessage() {
    return this.isPersonalView
      ? "Nothing on your schedule — no upcoming drives assigned to you."
      : "No upcoming test drives scheduled.";
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
