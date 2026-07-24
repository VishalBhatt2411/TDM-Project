import type { DealershipConfig } from "@tdm/postgres-adapter";

function layout(dealership: DealershipConfig, title: string, bodyHtml: string, accentHex = dealership.primaryColorHex ?? "#EB0A1E"): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:${accentHex};padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">${dealership.logoText ?? dealership.name}</span>
            <div style="color:#ffffff;opacity:0.85;font-size:13px;margin-top:2px;">${dealership.tagline ?? ""}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="font-size:20px;color:#111827;margin:0 0 16px;">${title}</h1>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:13px;color:#6b7280;">${dealership.name} · ${dealership.address ?? ""}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${dealership.phone ?? ""} ${dealership.email ? "· " + dealership.email : ""}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${dealership.operatingHours ?? ""}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string, accentHex: string): string {
  return `<a href="${href}" style="display:inline-block;background:${accentHex};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;font-size:14px;">${label}</a>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:14px;width:160px;">${label}</td>
    <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${value}</td>
  </tr>`;
}

export interface BookingEmailContext {
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

export function bookingConfirmationEmail(dealership: DealershipConfig, ctx: BookingEmailContext): { subject: string; html: string } {
  const accent = dealership.primaryColorHex ?? "#EB0A1E";
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${ctx.customerName},</p>
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
  return { subject: `Test Drive Confirmed — ${ctx.vehicleLabel} (${ctx.bookingReference})`, html: layout(dealership, "Your Test Drive is Confirmed", body, accent) };
}

export function accountAccessEmail(dealership: DealershipConfig, customerName: string, magicLinkUrl: string): { subject: string; html: string } {
  const accent = dealership.primaryColorHex ?? "#EB0A1E";
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${customerName},</p>
    <p style="color:#374151;font-size:15px;">We've created an account for you at ${dealership.name} so you can track and manage your test drive bookings.</p>
    <p style="margin:24px 0;">${button(magicLinkUrl, "Access My Bookings", accent)}</p>
    <p style="color:#6b7280;font-size:13px;">This secure link signs you in directly — no password needed. It expires in 48 hours; you can always request a new one from the login page.</p>
  `;
  return { subject: `Access your ${dealership.name} account`, html: layout(dealership, "Your Account is Ready", body, accent) };
}

export function cancellationEmail(dealership: DealershipConfig, ctx: BookingEmailContext, reason: string): { subject: string; html: string } {
  const accent = dealership.primaryColorHex ?? "#EB0A1E";
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${ctx.customerName},</p>
    <p style="color:#374151;font-size:15px;">Your test drive booking has been cancelled as requested.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      ${infoRow("Vehicle", ctx.vehicleLabel)}
      ${infoRow("Booking Reference", ctx.bookingReference)}
      ${infoRow("Original Date &amp; Time", ctx.scheduledStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("Reason", reason || "Not specified")}
    </table>
    <p style="color:#374151;font-size:15px;">Changed your mind? You're welcome to book a new test drive anytime.</p>
  `;
  return { subject: `Test Drive Cancelled — ${ctx.bookingReference}`, html: layout(dealership, "Booking Cancelled", body, accent) };
}

export function rescheduleEmail(dealership: DealershipConfig, ctx: BookingEmailContext, previousStart: Date): { subject: string; html: string } {
  const accent = dealership.primaryColorHex ?? "#EB0A1E";
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${ctx.customerName},</p>
    <p style="color:#374151;font-size:15px;">Your test drive has been rescheduled.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      ${infoRow("Vehicle", ctx.vehicleLabel)}
      ${infoRow("Booking Reference", ctx.bookingReference)}
      ${infoRow("Previous Time", previousStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("New Time", ctx.scheduledStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("Branch", `${ctx.branchName} — ${ctx.branchAddress}`)}
    </table>
  `;
  return { subject: `Test Drive Rescheduled — ${ctx.bookingReference}`, html: layout(dealership, "Booking Rescheduled", body, accent) };
}

export function reminderEmail(
  dealership: DealershipConfig,
  ctx: BookingEmailContext,
  kind: "24h" | "2h" | "day_of",
): { subject: string; html: string } {
  const accent = dealership.primaryColorHex ?? "#EB0A1E";
  const leadText = kind === "24h" ? "tomorrow" : kind === "2h" ? "in about 2 hours" : "today";
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${ctx.customerName},</p>
    <p style="color:#374151;font-size:15px;">Just a reminder — your test drive is <strong>${leadText}</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      ${infoRow("Vehicle", ctx.vehicleLabel)}
      ${infoRow("Date &amp; Time", ctx.scheduledStart.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" }))}
      ${infoRow("Branch", `${ctx.branchName} — ${ctx.branchAddress}`)}
    </table>
    <p style="color:#374151;font-size:15px;">Please bring a valid driving license. We look forward to seeing you!</p>
  `;
  return { subject: `Reminder: Your Test Drive is ${leadText}`, html: layout(dealership, "Test Drive Reminder", body, accent) };
}

export function followUpEmail(
  dealership: DealershipConfig,
  customerName: string,
  vehicleLabel: string,
  daysSince: number,
): { subject: string; html: string } {
  const accent = dealership.primaryColorHex ?? "#EB0A1E";
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${customerName},</p>
    <p style="color:#374151;font-size:15px;">It's been ${daysSince} days since your test drive of the ${vehicleLabel}. We hope you enjoyed it!</p>
    <p style="color:#374151;font-size:15px;">If you have any questions, or would like to discuss pricing, financing, or an exchange offer, your sales representative would be happy to help.</p>
    <p style="color:#374151;font-size:15px;">We're here whenever you're ready to take the next step.</p>
  `;
  return { subject: `Still thinking about the ${vehicleLabel}?`, html: layout(dealership, "We'd Love to Hear From You", body, accent) };
}

export function staffPasswordSetupEmail(
  dealership: DealershipConfig,
  staffName: string,
  role: string,
  setupUrl: string,
  isNewAccount: boolean,
): { subject: string; html: string } {
  const accent = dealership.primaryColorHex ?? "#EB0A1E";
  const intro = isNewAccount
    ? `An Admin Console account has been created for you at ${dealership.name} with the role of <strong>${role}</strong>.`
    : `A password reset was requested for your ${dealership.name} Admin Console account.`;
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${staffName},</p>
    <p style="color:#374151;font-size:15px;">${intro}</p>
    <p style="margin:24px 0;">${button(setupUrl, isNewAccount ? "Set Your Password" : "Reset Your Password", accent)}</p>
    <p style="color:#6b7280;font-size:13px;">This link expires in 1 hour. If you didn't expect this email, you can safely ignore it.</p>
  `;
  return {
    subject: isNewAccount ? `Your ${dealership.name} Admin Console account` : `Reset your ${dealership.name} Admin Console password`,
    html: layout(dealership, isNewAccount ? "Welcome to the Admin Console" : "Password Reset Requested", body, accent),
  };
}

export function passwordSetupEmail(
  dealership: DealershipConfig,
  customerName: string,
  setupUrl: string,
  isNewAccount: boolean,
): { subject: string; html: string } {
  const accent = dealership.primaryColorHex ?? "#EB0A1E";
  const intro = isNewAccount
    ? `We've created an account for you at ${dealership.name} so you can track and manage your test drive bookings. Set a password to sign in anytime.`
    : `A password reset was requested for your ${dealership.name} account.`;
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${customerName},</p>
    <p style="color:#374151;font-size:15px;">${intro}</p>
    <p style="margin:24px 0;">${button(setupUrl, isNewAccount ? "Set Your Password" : "Reset Your Password", accent)}</p>
    <p style="color:#6b7280;font-size:13px;">This link expires in 1 hour. If you didn't expect this email, you can safely ignore it.</p>
  `;
  return {
    subject: isNewAccount ? `Your ${dealership.name} account is ready` : `Reset your ${dealership.name} password`,
    html: layout(dealership, isNewAccount ? "Your Account is Ready" : "Password Reset Requested", body, accent),
  };
}

export function surveyRequestEmail(dealership: DealershipConfig, customerName: string, vehicleLabel: string, surveyUrl: string): { subject: string; html: string } {
  const accent = dealership.primaryColorHex ?? "#EB0A1E";
  const body = `
    <p style="color:#374151;font-size:15px;">Hi ${customerName},</p>
    <p style="color:#374151;font-size:15px;">Thank you for test driving the ${vehicleLabel} with us! We'd love your feedback — it takes less than 2 minutes.</p>
    <p style="margin:24px 0;">${button(surveyUrl, "Share Your Feedback", accent)}</p>
  `;
  return { subject: `How was your ${vehicleLabel} test drive?`, html: layout(dealership, "Tell Us About Your Experience", body, accent) };
}
