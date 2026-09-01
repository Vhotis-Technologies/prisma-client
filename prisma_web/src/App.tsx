import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { GuestOnly, HomeRedirect, RequireAuth } from "./auth/guards";
import ConnectionCheckPage from "./pages/ConnectionCheckPage";
import BookPage from "./pages/BookPage";
import BookingConfirmationPage from "./pages/BookingConfirmationPage";
import DashboardPage from "./pages/DashboardPage";
import GaragePage from "./pages/GaragePage";
import GuestBookPage from "./pages/GuestBookPage";
import GuestBookConfirmationPage from "./pages/GuestBookConfirmationPage";
import GuestClaimPage from "./pages/GuestClaimPage";
import GuestResultsPage from "./pages/GuestResultsPage";
import HistoryPage from "./pages/HistoryPage";
import HistoryDetailPage from "./pages/HistoryDetailPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import LoginPage from "./pages/LoginPage";
import RegisterDetailsPage from "./pages/RegisterDetailsPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import TransferPage from "./pages/TransferPage";
import SettingsPage from "./pages/SettingsPage";
import PaymentsPage from "./pages/PaymentsPage";
import SubscriptionPage from "./pages/SubscriptionPage";
import InvoicesPage from "./pages/InvoicesPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import BranchesPage from "./pages/BranchesPage";
import PayoutsPage from "./pages/PayoutsPage";
import WelcomePage from "./pages/WelcomePage";

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <AuthProvider>
        <Routes>
          <Route path="/connection" element={<ConnectionCheckPage />} />

          <Route element={<GuestOnly />}>
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/book/guest" element={<GuestBookPage />} />
            <Route path="/book/guest/confirmation" element={<GuestBookConfirmationPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/register/details" element={<RegisterDetailsPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/transfer/:transferId" element={<TransferPage />} />
          <Route path="/guest/b/:token" element={<GuestResultsPage />} />
          <Route path="/guest/claim/:token" element={<GuestClaimPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/branches" element={<BranchesPage />} />
            <Route path="/payouts" element={<PayoutsPage />} />
            <Route path="/book" element={<BookPage />} />
            <Route path="/book/confirmation" element={<BookingConfirmationPage />} />
            <Route path="/garage" element={<GaragePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:bookingId" element={<HistoryDetailPage />} />
            <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
            <Route path="/settings/profile" element={<SettingsPage />} />
            <Route path="/settings/email" element={<SettingsPage />} />
            <Route path="/settings/notifications" element={<SettingsPage />} />
            <Route path="/settings/tickets" element={<SettingsPage />} />
            <Route path="/settings/addresses" element={<SettingsPage />} />
            <Route path="/settings/payments" element={<PaymentsPage />} />
            <Route path="/settings/subscriptions" element={<SubscriptionPage />} />
            <Route path="/settings/invoices" element={<InvoicesPage />} />
            <Route path="/settings/invoices/:invoiceId" element={<InvoiceDetailPage />} />
            <Route path="/settings/tickets/:ticketId" element={<TicketDetailPage />} />
          </Route>

          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
