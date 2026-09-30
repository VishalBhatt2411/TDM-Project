import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { HomePage } from "@/pages/HomePage";
import { RegisterPage } from "@/pages/RegisterPage";
import { VerifyOtpPage } from "@/pages/VerifyOtpPage";
import { LoginPage } from "@/pages/LoginPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { SetPasswordPage } from "@/pages/SetPasswordPage";
import { MagicLoginPage } from "@/pages/MagicLoginPage";
import { VehiclesPage } from "@/pages/VehiclesPage";
import { VehicleDetailPage } from "@/pages/VehicleDetailPage";
import { BookingPage } from "@/pages/BookingPage";
import { MyBookingsPage } from "@/pages/MyBookingsPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { WishlistPage } from "@/pages/WishlistPage";
import { CompliancePage } from "@/pages/CompliancePage";
import { BranchLocatorPage } from "@/pages/BranchLocatorPage";
import { AdminLoginPage } from "@/pages/admin/AdminLoginPage";
import { AdminAuthCallbackPage } from "@/pages/admin/AdminAuthCallbackPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { AdminBookingsPage } from "@/pages/admin/AdminBookingsPage";
import { AdminFeatureFlagsPage } from "@/pages/admin/AdminFeatureFlagsPage";
import { AdminAuditLogPage } from "@/pages/admin/AdminAuditLogPage";
import { AdminBranchesPage } from "@/pages/admin/AdminBranchesPage";
import { AdminVehiclesPage } from "@/pages/admin/AdminVehiclesPage";
import { AdminSystemHealthPage } from "@/pages/admin/AdminSystemHealthPage";
import { AdminNotificationTemplatesPage } from "@/pages/admin/AdminNotificationTemplatesPage";
import { AdminBrandingPage } from "@/pages/admin/AdminBrandingPage";
import { CreateOrganizationPage } from "@/pages/onboarding/CreateOrganizationPage";
import { ConnectedAppInstructionsPage } from "@/pages/onboarding/ConnectedAppInstructionsPage";
import { SalesforceCredentialsPage } from "@/pages/onboarding/SalesforceCredentialsPage";
import { OnboardingCallbackPage } from "@/pages/onboarding/OnboardingCallbackPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/magic-login" element={<MagicLoginPage />} />
        <Route path="/vehicles" element={<VehiclesPage />} />
        <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
        <Route path="/branches" element={<BranchLocatorPage />} />
        {/* Booking is intentionally public — personal info doubles as inline registration. */}
        <Route path="/book/:vehicleId" element={<BookingPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/my-bookings" element={<MyBookingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/bookings/:id/compliance" element={<CompliancePage />} />
        </Route>
      </Route>

      {/* Self-service client onboarding — connects a new client's own Salesforce org. Public, no auth. */}
      <Route path="/onboarding" element={<CreateOrganizationPage />} />
      <Route path="/onboarding/:organizationId/connected-app" element={<ConnectedAppInstructionsPage />} />
      <Route path="/onboarding/:organizationId/credentials" element={<SalesforceCredentialsPage />} />
      <Route path="/onboarding/:organizationId/connecting" element={<OnboardingCallbackPage />} />

      {/* Admin Console — entirely separate auth space from the customer app, backed by Salesforce identity. */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/auth/callback" element={<AdminAuthCallbackPage />} />
      <Route element={<AdminProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/bookings" element={<AdminBookingsPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/feature-flags" element={<AdminFeatureFlagsPage />} />
          <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
          <Route path="/admin/branches" element={<AdminBranchesPage />} />
          <Route path="/admin/vehicles" element={<AdminVehiclesPage />} />
          <Route path="/admin/system-health" element={<AdminSystemHealthPage />} />
          <Route path="/admin/notification-templates" element={<AdminNotificationTemplatesPage />} />
          <Route path="/admin/branding" element={<AdminBrandingPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
