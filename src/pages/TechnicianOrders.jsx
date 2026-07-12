import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/StatusBadge';
import OrderDetail from '@/components/orders/OrderDetail';
import TechnicianServicesTab from '@/components/technicians/TechnicianServicesTab';
import { ORDER_STATUSES } from '@/lib/constants';
import { format, getMonth, getYear, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Search, Calendar, UserRound, Building2, FileText, LogOut, TrendingUp } from 'lucide-react';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i),
  label: format(new Date(2024, i, 1), 'LLLL', { locale: uk }),
}));

const YEARS = [2024, 2025, 2026];

export default function TechnicianOrders() {
  const { user } = useAuth();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('orders');
  
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(getMonth(now)));
  const [selectedYear, setSelectedYear] = useState(String(getYear(now)));

  const { data: technicians = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: async () => {
      const { data, error } = await supabase.from('technician').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const myTechnician = technicians.find(t => t.user_id === user?.id);

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ['workOrders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('WorkOrder')
        .select('*')
        .order('creation_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const myOrders = allOrders.filter(o => o.technician_id === myTechnician?.id);

  const earnings = useMemo(() => {
    if (!myTechnician) return { completed: 0, total: 0, details: [] };
    const periodStart = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth), 1));
    const periodEnd = endOfMonth(periodStart);

    const ordersInPeriod = myOrders.filter(o => {
      const dateStr = o.creation_date;
      if (!dateStr) return false;
      const d = parseISO(dateStr);
      return isWithinInterval(d, { start: periodStart, end: periodEnd }) && o.status !== 'Скасований';
    });

    let totalEarnings = 0;
    const details = ordersInPeriod.map(order => {
      let items = [];
      try {
        items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
      } catch (e) {
        items = [];
      }
      const orderSalary = items.reduce((sum, item) => {
        const pay = parseFloat(item.technician_pay || item.technician_price || 0);
        const qty = parseInt(item.quantity) || 1;
        return sum + pay * qty;
      }, 0);
      totalEarnings += orderSalary;
      return {
        order_number: order.order_number,
        patient_name: order.patient_name,
        creation_date: order.creation_date,
        status: order.status,
        amount: orderSalary,
      };
    });

    return {
      completed: ordersInPeriod.length,
      total: totalEarnings,
      details,
    };
  }, [myOrders, selectedMonth, selectedYear, myTechnician]);

  const filteredOrders = myOrders.filter(o => {
    if (statusFilter === 'active' && ['Зданий', 'Скасований'].includes(o.status)) return false;
    if (statusFilter !== 'active' && statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.patient_name?.toLowerCase().includes(q) || o.order_number?.toLowerCase().includes(q);
    }
    return true;
  });

  const monthLabel = MONTHS[parseInt(selectedMonth)]?.label;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  if (!myTechnician) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <UserRound className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Профіль не знайдено</h2>
        <p className="text-muted-foreground max-w-sm">
          Ваш акаунт ще не прив'язано до профілю техніка. Зверніться до адміністратора.
        </p>
        <Button variant="outline" className="mt-4 gap-2" onClick={handleLogout}>
          <LogOut className="w-4 h-4" /> Вийти
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold font-heading">Мій кабінет</h1>
        <p className="text-sm text-muted-foreground">
          {myTechnician.full_name} {myTechnician.specialization ? `• ${myTechnician.specialization}` : ''}
        </p>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'orders'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Мої наряди
        </button>
        <button
          onClick={() => setActiveTab('services')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'services'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Мої послуги
        </button>
      </div>

      {activeTab === 'services' && <TechnicianServicesTab technician={myTechnician} />}

      {activeTab === 'orders' && (
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" /> Твій заробіток
                </CardTitle>
                <div className="flex gap-2">
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-24 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/80 dark:bg-card rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Створено нарядів</p>
                  <p className="text-2xl font-bold text-primary">{earnings.completed}</p>
                </div>
                <div className="bg-white/80 dark:bg-card rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Заробіток за період</p>
                  <p className="text-2xl font-bold text-accent">{earnings.total.toFixed(0)} ₴</p>
                </div>
              </div>
              
              {earnings.details.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Деталізація:</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {earnings.details.map((det, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="font-mono text-muted-foreground">{det.order_number}</span>
                        <span className="font-medium">{det.patient_name}</span>
                        <span className="text-accent font-semibold">{det.amount.toFixed(0)} ₴</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                {monthLabel} {selectedYear} року • Усі наряди (крім скасованих) за датою створення
              </p>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активні</SelectItem>
                <SelectItem value="all">Всі</SelectItem>
                {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>Нарядів не знайдено</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map(order => (
                <Card
                  key={order.id}
                  className="cursor-pointer hover:shadow-md active:scale-[0.99] transition-all"
                  onClick={() => setSelectedOrder(order)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-xs font-mono text-muted-foreground">{order.order_number}</span>
                        <h3 className="font-semibold mt-0.5">{order.patient_name}</h3>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />{order.clinic_name || '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <UserRound className="w-3 h-3" />{order.doctor_name || '—'}
                      </span>
                      {order.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(order.due_date), 'd MMM', { locale: uk })}
                        </span>
                      )}
                    </div>
                    {order.items?.length > 0 && (
                      <div className="mt-2 pt-2 border-t flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">{order.items.length} послуг</span>
                        <span className="text-sm font-bold">{order.total_amount?.toFixed(2)} грн</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {selectedOrder && (
            <OrderDetail
              order={selectedOrder}
              open={!!selectedOrder}
              onClose={() => setSelectedOrder(null)}
              isAdmin={false}
            />
          )}
        </div>
      )}
    </div>
  );
}