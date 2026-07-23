import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { HomePage } from "@/pages/HomePage";
import { RegisterPage } from "@/pages/RegisterPage";
import { VerifyOtpPage } from "@/pages/VerifyOtpPage";
import { LoginPage } from "@/pages/LoginPage";
import { MagicLoginPage } from "@/pages/MagicLoginPage";
import { VehiclesPage } from "@/pages/VehiclesPage";
import { VehicleDetailPage } from "@/pages/VehicleDetailPage";
import { BookingPage } from "@/pages/BookingPage";
import { MyBookingsPage } from "@/pages/MyBookingsPage";
import { AdminLoginPage } from "@/pages/admin/AdminLoginPage";
import { AdminForgotPasswordPage } from "@/pages/admin/AdminForgotPasswordPage";
import { AdminSetPasswordPage } from "@/pages/admin/AdminSetPasswordPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { AdminBookingsPage } from "@/pages/admin/AdminBookingsPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/magic-login" element={<MagicLoginPage />} />
        <Route path="/vehicles" element={<VehiclesPage />} />
        <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
        {/* Booking is intentionally public — personal info doubles as inline registration. */}
        <Route path="/book/:vehicleId" element={<BookingPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/my-bookings" element={<MyBookingsPage />} />
        </Route>
      </Route>

      {/* Admin Console — entirely separate auth space from the customer app. */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/forgot-password" element={<AdminForgotPasswordPage />} />
      <Route path="/admin/set-password" element={<AdminSetPasswordPage />} />
      <Route element={<AdminProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/bookings" element={<AdminBookingsPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
