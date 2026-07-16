import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { registerPlugin } from '@capacitor/core';
const CapApp = registerPlugin('App');
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
import ReceiptTemplateSettings from '@/pages/ReceiptTemplateSettings'; // ← ОДИН РАЗ
import OrderSettings from '@/pages/OrderSettings';
import TechnicianSalaryReport from '@/pages/TechnicianSalaryReport';
import AuthCallback from '@/pages/AuthCallback'; // ← ОДИН РАЗ
import PublicOrderView from '@/pages/PublicOrderView';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} /> {/* ← ОДИН РАЗ */}
      <Route path="/p/order/:id" element={<PublicOrderView />} />

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
          <Route path="/receipt-settings" element={<ReceiptTemplateSettings />} /> {/* ← ОДИН РАЗ */}
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

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Обробка глибоких посилань (Deep Links) для Capacitor
    const setupDeepLinks = async () => {
      CapApp.addListener('appUrlOpen', (event) => {
        console.log('App opened with URL:', event.url);

        // Вилучаємо схему (com.imilab.app://) щоб отримати шлях
        const slug = event.url.split('://').pop();

        if (slug) {
          // Навігуємо React Router на потрібний шлях (наприклад, /auth/callback)
          navigate('/' + slug);
        }
      });
    };

    if (window.Capacitor) {
      setupDeepLinks();
    }

    return () => {
      CapApp.removeAllListeners();
    };
  }, [navigate]);

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground mt-3">Завантаження...</p>
        </div>
      </div>
    );
  }

  // Не редиректимо на логін, якщо шлях публічний (починається на /p/)
  const isPublicPath = location.pathname.startsWith('/p/');

  if (authError && !isPublicPath) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return <AppRoutes />;
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
