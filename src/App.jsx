import ExternalLab from '@/pages/ExternalLab';
import ExpenseSettings from '@/pages/ExpenseSettings';
import InvoiceTemplateSettings from '@/pages/InvoiceTemplateSettings';
import ReceiptTemplateSettings from '@/pages/ReceiptTemplateSettings'; // ← ЗАЛИШІТЬ ОДИН
import OrderSettings from '@/pages/OrderSettings';
import TechnicianSalaryReport from '@/pages/TechnicianSalaryReport';
import AuthCallback from '@/pages/AuthCallback';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

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
          <Route path="/receipt-settings" element={<ReceiptTemplateSettings />} /> {/* ← ЗАЛИШІТЬ ОДИН МАРШРУТ */}
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

  if (authError) {
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
