import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useState } from 'react';
import {
  LayoutDashboard, FileText, Building2, UserRound, Wrench,
  ClipboardList, Menu, X, LogOut, ChevronDown, Smartphone, CalendarDays, BarChart2, FlaskConical, DollarSign, Settings, Receipt
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

const adminLinks = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard },
  { to: '/orders', label: 'Наряди', icon: FileText },
  { to: '/clinics', label: 'Клініки', icon: Building2 },
  { to: '/doctors', label: 'Лікарі', icon: UserRound },
  { to: '/technicians', label: 'Техніки', icon: Wrench },
  { to: '/calendar', label: 'Календар', icon: CalendarDays },
  { to: '/reports', label: 'Звіти', icon: BarChart2 },
  { to: '/pricelist', label: 'Прайс-лист', icon: ClipboardList },
  { to: '/expenses', label: 'Витрати', icon: DollarSign },
  { to: '/order-settings', label: 'Шаблони наряду', icon: Settings },
  { to: '/invoice-settings', label: 'Налаштування рахунку', icon: FileText },
  { to: '/receipt-settings', label: 'Чек для лікаря', icon: Receipt }, // ← додано
  { to: '/external-lab', label: 'Зовнішні лаби', icon: FlaskConical },
  { to: '/install', label: 'Встановити застосунок', icon: Smartphone },
];

const techLinks = [
  { to: '/', label: 'Мої наряди', icon: FileText },
  { to: '/install', label: 'Встановити застосунок', icon: Smartphone },
];

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = user?.role === 'admin';
  const links = isAdmin ? adminLinks : techLinks;

  // Безпечна функція виходу з обробкою помилок
  const handleLogout = async () => {
    try {
      if (base44 && base44.auth && typeof base44.auth.logout === 'function') {
        await base44.auth.logout();
      } else {
        localStorage.clear();
        window.location.href = '/login';
      }
    } catch (error) {
      console.error("Помилка під час виходу:", error);
      window.location.href = '/login';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r border-border bg-card">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <img 
            src="https://media.base44.com/images/public/6a2586df519da133b2eddb2b/81b6f23b1_photo_2026-06-07_18-59-57.jpg" 
            alt="IMI Lab" 
            className="w-12 h-12 object-contain" 
          />
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight font-heading">IMI Lab</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Зуботехнічна лабораторія</p>
          </div>
        </div>
        
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {links.map(link => {
            const Icon = link.icon;
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left focus:outline-none">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                  {user?.full_name?.[0] || user?.username?.[0] || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user?.full_name || user?.username || 'Користувач'}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role === 'admin' ? 'Адміністратор' : 'Технік'}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Вийти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <img 
              src="https://media.base44.com/images/public/6a2586df519da133b2eddb2b/81b6f23b1_photo_2026-06-07_18-59-57.jpg" 
              alt="IMI Lab" 
              className="w-8 h-8 object-contain" 
            />
            <h1 className="text-lg font-bold text-primary font-heading">IMI Lab</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
        
        {mobileMenuOpen && (
          <nav className="px-4 pb-4 space-y-1 bg-card border-b border-border animate-in fade-in slide-in-from-top-2 duration-150">
            {links.map(link => {
              const Icon = link.icon;
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                  {link.label}
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 w-full text-left"
            >
              <LogOut className="w-4.5 h-4.5" />
              Вийти
            </button>
          </nav>
        )}
      </header>

      {/* Main content viewport */}
      <main className="lg:pl-64 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}