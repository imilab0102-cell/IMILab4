import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Orders from '@/pages/Orders';
import Clinics from '@/pages/Clinics';
import Doctors from '@/pages/Doctors';
import Technicians from '@/pages/Technicians';
import PriceList from '@/pages/PriceList';
import TechnicianOrders from '@/pages/TechnicianOrders';
import InstallApp from '@/pages/InstallApp';
import CalendarView from '@/pages/CalendarView';
import Reports from '@/pages/Reports';
import ExternalLab from '@/pages/ExternalLab';
import ExpenseSettings from '@/pages/ExpenseSettings';
import InvoiceTemplateSettings from '@/pages/InvoiceTemplateSettings';
import ReceiptTemplateSettings from '@/pages/ReceiptTemplateSettings';
import OrderSettings from '@/pages/OrderSettings';
import TechnicianSalaryReport from '@/pages/TechnicianSalaryReport';
import AuthCallback from '@/pages/AuthCallback'; // ← ДОДАЙТЕ ЦЕЙ ІМПОРТ

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} /> {/* ← ДОДАЙТЕ ЦЕЙ МАРШРУТ */}
      
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/clinics" element={<Clinics />} />
          <Route path="/doctors" element={<Doctors />} />
          <Route path="/technicians" element={<Technicians />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/external-lab" element={<ExternalLab />} />
          <Route path="/pricelist" element={<PriceList />} />
          <Route path="/expenses" element={<ExpenseSettings />} />
          <Route path="/invoice-settings" element={<InvoiceTemplateSettings />} />
          <Route path="/receipt-settings" element={<ReceiptTemplateSettings />} />
          <Route path="/order-settings" element={<OrderSettings />} />
          <Route path="/install" element={<InstallApp />} />
          <Route path="/my-orders" element={<TechnicianOrders />} />
          <Route path="/technicians/salary-report" element={<TechnicianSalaryReport />} />
        </Route>
      </Route>
      
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

// ... решта коду залишається без змін
