import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { lazyPage } from "@/lib/lazy-page";
import { HomePage } from "@/pages/HomePage";
import { VehiclesPage } from "@/pages/VehiclesPage";
import { VehicleDetailPage } from "@/pages/VehicleDetailPage";

const RegisterPage = lazyPage(() => import("@/pages/RegisterPage"), "RegisterPage");
const VerifyOtpPage = lazyPage(() => import("@/pages/VerifyOtpPage"), "VerifyOtpPage");
const LoginPage = lazyPage(() => import("@/pages/LoginPage"), "LoginPage");
const ForgotPasswordPage = lazyPage(() => import("@/pages/ForgotPasswordPage"), "ForgotPasswordPage");
const SetPasswordPage = lazyPage(() => import("@/pages/SetPasswordPage"), "SetPasswordPage");
const MagicLoginPage = lazyPage(() => import("@/pages/MagicLoginPage"), "MagicLoginPage");
const BookingPage = lazyPage(() => import("@/pages/BookingPage"), "BookingPage");
const MyBookingsPage = lazyPage(() => import("@/pages/MyBookingsPage"), "MyBookingsPage");
const ProfilePage = lazyPage(() => import("@/pages/ProfilePage"), "ProfilePage");
const WishlistPage = lazyPage(() => import("@/pages/WishlistPage"), "WishlistPage");
const CompliancePage = lazyPage(() => import("@/pages/CompliancePage"), "CompliancePage");
const BranchLocatorPage = lazyPage(() => import("@/pages/BranchLocatorPage"), "BranchLocatorPage");
const AdminLoginPage = lazyPage(() => import("@/pages/admin/AdminLoginPage"), "AdminLoginPage");
const AdminAuthCallbackPage = lazyPage(() => import("@/pages/admin/AdminAuthCallbackPage"), "AdminAuthCallbackPage");
const AdminDashboardPage = lazyPage(() => import("@/pages/admin/AdminDashboardPage"), "AdminDashboardPage");
const AdminUsersPage = lazyPage(() => import("@/pages/admin/AdminUsersPage"), "AdminUsersPage");
const AdminBookingsPage = lazyPage(() => import("@/pages/admin/AdminBookingsPage"), "AdminBookingsPage");
const AdminFeatureFlagsPage = lazyPage(() => import("@/pages/admin/AdminFeatureFlagsPage"), "AdminFeatureFlagsPage");
const AdminAuditLogPage = lazyPage(() => import("@/pages/admin/AdminAuditLogPage"), "AdminAuditLogPage");
const AdminBranchesPage = lazyPage(() => import("@/pages/admin/AdminBranchesPage"), "AdminBranchesPage");
const AdminVehiclesPage = lazyPage(() => import("@/pages/admin/AdminVehiclesPage"), "AdminVehiclesPage");
const AdminSystemHealthPage = lazyPage(() => import("@/pages/admin/AdminSystemHealthPage"), "AdminSystemHealthPage");
const AdminNotificationTemplatesPage = lazyPage(() => import("@/pages/admin/AdminNotificationTemplatesPage"), "AdminNotificationTemplatesPage");
const AdminBrandingPage = lazyPage(() => import("@/pages/admin/AdminBrandingPage"), "AdminBrandingPage");
const CreateOrganizationPage = lazyPage(() => import("@/pages/onboarding/CreateOrganizationPage"), "CreateOrganizationPage");
const ConnectedAppInstructionsPage = lazyPage(() => import("@/pages/onboarding/ConnectedAppInstructionsPage"), "ConnectedAppInstructionsPage");
const SalesforceCredentialsPage = lazyPage(() => import("@/pages/onboarding/SalesforceCredentialsPage"), "SalesforceCredentialsPage");
const OnboardingCallbackPage = lazyPage(() => import("@/pages/onboarding/OnboardingCallbackPage"), "OnboardingCallbackPage");
const VerifyEmailPage = lazyPage(() => import("@/pages/onboarding/VerifyEmailPage"), "VerifyEmailPage");
const ResumeOnboardingPage = lazyPage(() => import("@/pages/onboarding/ResumeOnboardingPage"), "ResumeOnboardingPage");
const PlatformConsolePage = lazyPage(() => import("@/pages/platform/PlatformConsolePage"), "PlatformConsolePage");

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
      <Route path="/onboarding/verify" element={<VerifyEmailPage />} />
      <Route path="/onboarding/:organizationId/connected-app" element={<ConnectedAppInstructionsPage />} />
      <Route path="/onboarding/:organizationId/credentials" element={<SalesforceCredentialsPage />} />
      <Route path="/onboarding/:organizationId/connecting" element={<OnboardingCallbackPage />} />
      <Route path="/onboarding/:organizationId/resume" element={<ResumeOnboardingPage />} />
      {/* Platform operator console — deliberately unlinked; password-protected by the API. */}
      <Route path="/platform" element={<PlatformConsolePage />} />

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
