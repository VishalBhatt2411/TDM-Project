import type { BrandProfile } from "@tdm/domain";

/**
 * Escapes a value for safe interpolation into HTML email bodies. Every template below
 * renders fields sourced from customer/staff free text (names, cancellation reasons,
 * dealership config) — without this, `<img src=x onerror=...>` in e.g. a cancellation
 * reason would execute in whatever mail client renders the resulting HTML.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Neutral presentation default for a brand that hasn't set Primary_Color_Hex__c — deliberately no one's brand color. */
const NEUTRAL_ACCENT_HEX = "#111827";

/** Validates a `#rrggbb`/`#rgb` hex color before it's placed unescaped into a `style` attribute; falls back to the neutral default otherwise. */
function accentOf(brand: BrandProfile): string {
  const value = brand.primaryColorHex;
  return value && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value) ? value : NEUTRAL_ACCENT_HEX;
}

/** The brand's logo as an <img> when it's an https URL, otherwise its logo text (or name). */
function brandMark(brand: BrandProfile): string {
  const label = escapeHtml(brand.logoText ?? brand.name);
  if (brand.logoUrl && /^https:\/\/[^\s"'<>]+$/.test(brand.logoUrl)) {
    return `<img src="${escapeHtml(brand.logoUrl)}" alt="${label}" height="32" style="display:block;height:32px;border:0;">`;
  }
  return `<span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">${label}</span>`;
}

function layout(
  dealership: BrandProfile,
  title: string,
  bodyHtml: string,
  accentHex = accentOf(dealership),
  note?: string,
): string {
  const noteHtml = note
    ? `<div style="margin:0 0 16px;padding:12px 16px;background:#fffbeb;border-left:3px solid ${accentHex};border-radius:4px;color:#374151;font-size:14px;">${escapeHtml(note)}</div>`
    : "";
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:${accentHex};padding:24px 32px;">
            ${brandMark(dealership)}
            <div style="color:#ffffff;opacity:0.85;font-size:13px;margin-top:2px;">${escapeHtml(dealership.tagline ?? "")}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="font-size:20px;color:#111827;margin:0 0 16px;">${escapeHtml(title)}</h1>
            ${noteHtml}
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            ${footerLine([dealership.name, dealership.address], "0")}
            ${footerLine([dealership.phone, dealership.email], "4px 0 0")}
            ${footerLine([dealership.operatingHours], "4px 0 0")}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** A footer line of whichever contact details the brand has set — omitted entirely when none are. */
function footerLine(parts: (string | undefined)[], margin: string): string {
  const text = parts.filter((p): p is string => !!p?.trim()).map(escapeHtml).join(" · ");
  return text ? `<p style="margin:${margin};font-size:13px;color:#6b7280;">${text}</p>` : "";
}

function button(href: string, label: string, accentHex: string): string {
  return `<a href="${encodeURI(href)}" style="display:inline-block;background:${accentHex};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;font-size:14px;">${escapeHtml(label)}</a>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:14px;width:160px;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
  </tr>`;
}

/** Staff-editable customization for a notification template — see NotificationTemplateRepository. Both fields are optional; a missing one falls back to the hardcoded default subject / no extra note. */
export interface TemplateOverride {
  subject?: string;
  note?: string;
}

export interface BookingEmailContext {
  /** Dealership the booking's branch belongs to — its branding and template overrides apply. */
  dealershipId: string;
  customerName: string;
  vehicleLabel: string;
  vehicleImageUrl?: string;
  bookingReference: string;
  scheduledStart: Date;
  driveType: string;
  branchName: string;
  branchAddress: string;
  salesRepName?: string;
}

export function bookingConfirmationEmail(dealership: BrandProfile, ctx: BookingEmailContext, override?: TemplateOverride): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(ctx.customerName)},</p>
    <p style="color:#374151;font-size:15px;">Your test drive is confirmed! Here are the details:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      ${infoRow("Vehicle", ctx.vehicleLabel)}
      ${infoRow("Booking Reference", ctx.bookingReference)}
      ${infoRow("Date &amp; Time", ctx.scheduledStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("Drive Type", ctx.driveType === "Home" ? "Home Test Drive" : "Showroom Test Drive")}
      ${infoRow("Branch", `${ctx.branchName} — ${ctx.branchAddress}`)}
      ${ctx.salesRepName ? infoRow("Your Sales Contact", ctx.salesRepName) : ""}
    </table>
    <p style="color:#374151;font-size:15px;">Please bring a valid driving license to your appointment.</p>
    <p style="color:#374151;font-size:14px;">Need to change plans? You can reschedule or cancel anytime from your account — just log in and visit "My Bookings".</p>
  `;
  return {
    subject: override?.subject ?? `Test Drive Confirmed — ${ctx.vehicleLabel} (${ctx.bookingReference})`,
    html: layout(dealership, "Your Test Drive is Confirmed", body, accent, override?.note),
  };
}

export function accountAccessEmail(dealership: BrandProfile, customerName: string, magicLinkUrl: string, override?: TemplateOverride): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(customerName)},</p>
    <p style="color:#374151;font-size:15px;">We've created an account for you at ${escapeHtml(dealership.name)} so you can track and manage your test drive bookings.</p>
    <p style="margin:24px 0;">${button(magicLinkUrl, "Access My Bookings", accent)}</p>
    <p style="color:#6b7280;font-size:13px;">This secure link signs you in directly — no password needed. It expires in 48 hours; you can always request a new one from the login page.</p>
  `;
  return {
    subject: override?.subject ?? `Access your ${dealership.name} account`,
    html: layout(dealership, "Your Account is Ready", body, accent, override?.note),
  };
}

export function waitlistedEmail(dealership: BrandProfile, ctx: BookingEmailContext, position: number, override?: TemplateOverride): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(ctx.customerName)},</p>
    <p style="color:#374151;font-size:15px;">The ${escapeHtml(ctx.vehicleLabel)} isn't available for your requested time, so we've added you to the waitlist.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      ${infoRow("Vehicle", ctx.vehicleLabel)}
      ${infoRow("Booking Reference", ctx.bookingReference)}
      ${infoRow("Requested Date &amp; Time", ctx.scheduledStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("Waitlist Position", `#${position}`)}
      ${infoRow("Branch", `${ctx.branchName} — ${ctx.branchAddress}`)}
    </table>
    <p style="color:#374151;font-size:15px;">We'll email you the moment a slot opens up and your booking is confirmed.</p>
  `;
  return {
    subject: override?.subject ?? `You're on the Waitlist — ${ctx.vehicleLabel} (${ctx.bookingReference})`,
    html: layout(dealership, "Added to the Waitlist", body, accent, override?.note),
  };
}

export function waitlistPromotedEmail(dealership: BrandProfile, ctx: BookingEmailContext, override?: TemplateOverride): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(ctx.customerName)},</p>
    <p style="color:#374151;font-size:15px;">Good news — a slot has opened up and your test drive is now confirmed!</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      ${infoRow("Vehicle", ctx.vehicleLabel)}
      ${infoRow("Booking Reference", ctx.bookingReference)}
      ${infoRow("Date &amp; Time", ctx.scheduledStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("Drive Type", ctx.driveType === "Home" ? "Home Test Drive" : "Showroom Test Drive")}
      ${infoRow("Branch", `${ctx.branchName} — ${ctx.branchAddress}`)}
      ${ctx.salesRepName ? infoRow("Your Sales Contact", ctx.salesRepName) : ""}
    </table>
    <p style="color:#374151;font-size:15px;">Please bring a valid driving license to your appointment.</p>
  `;
  return {
    subject: override?.subject ?? `You're Confirmed! — ${ctx.vehicleLabel} (${ctx.bookingReference})`,
    html: layout(dealership, "Waitlist Slot Confirmed", body, accent, override?.note),
  };
}

export function cancellationEmail(dealership: BrandProfile, ctx: BookingEmailContext, reason: string, override?: TemplateOverride): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(ctx.customerName)},</p>
    <p style="color:#374151;font-size:15px;">Your test drive booking has been cancelled as requested.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      ${infoRow("Vehicle", ctx.vehicleLabel)}
      ${infoRow("Booking Reference", ctx.bookingReference)}
      ${infoRow("Original Date &amp; Time", ctx.scheduledStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("Reason", reason || "Not specified")}
    </table>
    <p style="color:#374151;font-size:15px;">Changed your mind? You're welcome to book a new test drive anytime.</p>
  `;
  return {
    subject: override?.subject ?? `Test Drive Cancelled — ${ctx.bookingReference}`,
    html: layout(dealership, "Booking Cancelled", body, accent, override?.note),
  };
}

export function rescheduleEmail(dealership: BrandProfile, ctx: BookingEmailContext, previousStart: Date, override?: TemplateOverride): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(ctx.customerName)},</p>
    <p style="color:#374151;font-size:15px;">Your test drive has been rescheduled.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      ${infoRow("Vehicle", ctx.vehicleLabel)}
      ${infoRow("Booking Reference", ctx.bookingReference)}
      ${infoRow("Previous Time", previousStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("New Time", ctx.scheduledStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("Branch", `${ctx.branchName} — ${ctx.branchAddress}`)}
    </table>
  `;
  return {
    subject: override?.subject ?? `Test Drive Rescheduled — ${ctx.bookingReference}`,
    html: layout(dealership, "Booking Rescheduled", body, accent, override?.note),
  };
}

export function reminderEmail(
  dealership: BrandProfile,
  ctx: BookingEmailContext,
  kind: "24h" | "2h" | "day_of",
  override?: TemplateOverride,
): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const leadText = kind === "24h" ? "tomorrow" : kind === "2h" ? "in about 2 hours" : "today";
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(ctx.customerName)},</p>
    <p style="color:#374151;font-size:15px;">Just a reminder — your test drive is <strong>${leadText}</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      ${infoRow("Vehicle", ctx.vehicleLabel)}
      ${infoRow("Date &amp; Time", ctx.scheduledStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("Branch", `${ctx.branchName} — ${ctx.branchAddress}`)}
    </table>
    <p style="color:#374151;font-size:15px;">Please bring a valid driving license. We look forward to seeing you!</p>
  `;
  return {
    subject: override?.subject ?? `Reminder: Your Test Drive is ${leadText}`,
    html: layout(dealership, "Test Drive Reminder", body, accent, override?.note),
  };
}

export function followUpEmail(
  dealership: BrandProfile,
  customerName: string,
  vehicleLabel: string,
  daysSince: number,
  override?: TemplateOverride,
): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(customerName)},</p>
    <p style="color:#374151;font-size:15px;">It's been ${daysSince} days since your test drive of the ${escapeHtml(vehicleLabel)}. We hope you enjoyed it!</p>
    <p style="color:#374151;font-size:15px;">If you have any questions, or would like to discuss pricing, financing, or an exchange offer, your sales representative would be happy to help.</p>
    <p style="color:#374151;font-size:15px;">We're here whenever you're ready to take the next step.</p>
  `;
  return {
    subject: override?.subject ?? `Still thinking about the ${vehicleLabel}?`,
    html: layout(dealership, "We'd Love to Hear From You", body, accent, override?.note),
  };
}

export function passwordSetupEmail(
  dealership: BrandProfile,
  customerName: string,
  setupUrl: string,
  isNewAccount: boolean,
  override?: TemplateOverride,
): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const intro = isNewAccount
    ? `We've created an account for you at ${escapeHtml(dealership.name)} so you can track and manage your test drive bookings. Set a password to sign in anytime.`
    : `A password reset was requested for your ${escapeHtml(dealership.name)} account.`;
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(customerName)},</p>
    <p style="color:#374151;font-size:15px;">${intro}</p>
    <p style="margin:24px 0;">${button(setupUrl, isNewAccount ? "Set Your Password" : "Reset Your Password", accent)}</p>
    <p style="color:#6b7280;font-size:13px;">This link expires in 1 hour. If you didn't expect this email, you can safely ignore it.</p>
  `;
  return {
    subject: override?.subject ?? (isNewAccount ? `Your ${dealership.name} account is ready` : `Reset your ${dealership.name} password`),
    html: layout(dealership, isNewAccount ? "Your Account is Ready" : "Password Reset Requested", body, accent, override?.note),
  };
}

export function otpCodeEmail(
  dealership: BrandProfile,
  code: string,
  ttlMinutes: number,
  override?: TemplateOverride,
): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const body = `
    <p style="color:#374151;font-size:15px;">Use this code to verify your ${escapeHtml(dealership.name)} account:</p>
    <p style="margin:24px 0;font-size:32px;font-weight:bold;letter-spacing:8px;color:#111827;">${escapeHtml(code)}</p>
    <p style="color:#6b7280;font-size:13px;">This code expires in ${ttlMinutes} minutes. Never share it with anyone — ${escapeHtml(dealership.name)} staff will never ask for it.</p>
  `;
  return {
    subject: override?.subject ?? `Your ${dealership.name} verification code`,
    html: layout(dealership, "Your Verification Code", body, accent, override?.note),
  };
}

export function salesRepAssignedEmail(
  dealership: BrandProfile,
  repName: string,
  ctx: BookingEmailContext,
  override?: TemplateOverride,
): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(repName)},</p>
    <p style="color:#374151;font-size:15px;">You've been assigned to a test drive. Here are the details:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      ${infoRow("Customer", ctx.customerName)}
      ${infoRow("Vehicle", ctx.vehicleLabel)}
      ${infoRow("Booking Reference", ctx.bookingReference)}
      ${infoRow("Date &amp; Time", ctx.scheduledStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("Drive Type", ctx.driveType === "Home" ? "Home Test Drive" : "Showroom Test Drive")}
      ${infoRow("Branch", `${ctx.branchName} — ${ctx.branchAddress}`)}
    </table>
    <p style="color:#374151;font-size:15px;">Log in to the Admin Console to view or act on this booking.</p>
  `;
  return {
    subject: override?.subject ?? `New Test Drive Assigned — ${ctx.vehicleLabel} (${ctx.bookingReference})`,
    html: layout(dealership, "You've Been Assigned a Test Drive", body, accent, override?.note),
  };
}

export function surveyRequestEmail(dealership: BrandProfile, customerName: string, vehicleLabel: string, surveyUrl: string, override?: TemplateOverride): { subject: string; html: string } {
  const accent = accentOf(dealership);
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(customerName)},</p>
    <p style="color:#374151;font-size:15px;">Thank you for test driving the ${escapeHtml(vehicleLabel)} with us! We'd love your feedback — it takes less than 2 minutes.</p>
    <p style="margin:24px 0;">${button(surveyUrl, "Share Your Feedback", accent)}</p>
  `;
  return {
    subject: override?.subject ?? `How was your ${vehicleLabel} test drive?`,
    html: layout(dealership, "Tell Us About Your Experience", body, accent, override?.note),
  };
}

/** The fixed set of notification templates an admin can customize (subject line + an optional highlighted note) — see NotificationTemplateRepository. */
export const NOTIFICATION_TEMPLATE_KEYS = [
  { key: "bookingConfirmation", label: "Booking Confirmation", defaultSubject: "Test Drive Confirmed — {vehicle} ({reference})" },
  { key: "accountAccess", label: "Account Access", defaultSubject: "Access your {dealership} account" },
  { key: "waitlisted", label: "Waitlisted", defaultSubject: "You're on the Waitlist — {vehicle} ({reference})" },
  { key: "waitlistPromoted", label: "Waitlist Promoted", defaultSubject: "You're Confirmed! — {vehicle} ({reference})" },
  { key: "cancellation", label: "Booking Cancelled", defaultSubject: "Test Drive Cancelled — {reference}" },
  { key: "reschedule", label: "Booking Rescheduled", defaultSubject: "Test Drive Rescheduled — {reference}" },
  { key: "reminder", label: "Booking Reminder", defaultSubject: "Reminder: Your Test Drive is {when}" },
  { key: "followUp", label: "Post-Drive Follow-up", defaultSubject: "Still thinking about the {vehicle}?" },
  { key: "passwordSetup", label: "Password Setup / Reset", defaultSubject: "Your {dealership} account is ready / Reset your password" },
  { key: "salesRepAssigned", label: "Sales Rep Assigned", defaultSubject: "New Test Drive Assigned — {vehicle} ({reference})" },
  { key: "surveyRequest", label: "Survey Request", defaultSubject: "How was your {vehicle} test drive?" },
  { key: "otpCode", label: "Verification Code (OTP)", defaultSubject: "Your {dealership} verification code" },
] as const;

export type NotificationTemplateKey = (typeof NOTIFICATION_TEMPLATE_KEYS)[number]["key"];
