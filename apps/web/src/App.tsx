import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { HomePage } from "@/pages/HomePage";
import { RegisterPage } from "@/pages/RegisterPage";
import { VerifyOtpPage } from "@/pages/VerifyOtpPage";
import { LoginPage } from "@/pages/LoginPage";
import { MagicLoginPage } from "@/pages/MagicLoginPage";
import { VehiclesPage } from "@/pages/VehiclesPage";
import { VehicleDetailPage } from "@/pages/VehicleDetailPage";
import { BookingPage } from "@/pages/BookingPage";
import { MyBookingsPage } from "@/pages/MyBookingsPage";
import { DashboardPage } from "@/pages/DashboardPage";

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
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
