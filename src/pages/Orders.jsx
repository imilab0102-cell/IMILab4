import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { generateOrderNumber, ORDER_STATUSES, WORK_CATEGORIES } from '@/lib/constants';
import PageHeader from '@/components/PageHeader';

// Планувальник нагадувань про дедлайни
const scheduleDeadlineReminder = async (order) => {
  if (!order.due_date) return;
  try {
    const { LocalNotifications } = await import(/* @vite-ignore */ '@capacitor/local-notifications');
    const dueDate = new Date(order.due_date);
    const reminderTime = new Date(dueDate.getTime() - 2 * 60 * 60 * 1000);
    if (reminderTime > new Date()) {
      await LocalNotifications.schedule({
        notifications: [{
          title: 'Нагадування про дедлайн ⏱️',
          body: `Роботу по пацієнту ${order.patient_name || ''} потрібно здати сьогодні!`,
          id: Math.floor(Math.random() * 1000000),
          schedule: { at: reminderTime }
        }]
      });
    }
  } catch (e) {}
};

import KanbanBoard from '@/components/orders/KanbanBoard';
import OrderCard from '@/components/orders/OrderCard';
import OrderForm from '@/components/orders/OrderForm';
import OrderDetail from '@/components/orders/OrderDetail';

const INTERNAL_EXCHANGE_RATES = { USD: 41.5, EUR: 44.5 };

const calculateOrderTotals = (items, discountPercent = 0) => {
  const totalsByCurrency = { UAH: 0, USD: 0, EUR: 0 };
  let techPayInUah = 0;

  // Отримуємо актуальні курси з localStorage (збережені Reports.jsx або Dashboard.jsx)
  let activeRates = { USD: 41.5, EUR: 44.5 };
  try {
    const cached = localStorage.getItem('exchangeRates');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.USD > 10) activeRates = parsed;
    }
  } catch (e) {}

  items.forEach(item => {
    const currency = item.price_currency || 'UAH';
    const qty = item.quantity || 1;
    const price = item.unit_price || 0;
    const rate = activeRates[currency] || 1;

    totalsByCurrency[currency] += qty * price;

    // ВАЖЛИВО: Зарплата техніка (technician_price) в системі IMILab
    // ЗАВЖДИ вказується в ГРИВНЯХ (UAH) у прайсі, незалежно від валюти послуги.
    // Тому ми НЕ множимо її на курс валют.
    techPayInUah += (qty * (item.technician_price || 0));
  });

  if (discountPercent > 0) {
    Object.keys(totalsByCurrency).forEach(curr => {
      totalsByCurrency[curr] *= (1 - discountPercent / 100);
    });
  }

  const totalInUah =
    (totalsByCurrency.UAH || 0) +
    (totalsByCurrency.USD || 0) * activeRates.USD +
    (totalsByCurrency.EUR || 0) * activeRates.EUR;

  return {
    totalsByCurrency,
    totalInUah: Math.round(totalInUah),
    techPayInUah: Math.round(techPayInUah),
    netProfit: Math.round(totalInUah - techPayInUah)
  };
};

const isValidUUID = (id) => {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
};

const safeId = (val) => {
  if (val === undefined || val === null || val === '' || val === 'none' || val === '0' || val === 0) return null;
  const strVal = String(val).trim();
  return isValidUUID(strVal) ? strVal : null;
};

const parseItems = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
};

export default function Orders() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [view, setView] = useState('kanban');
  const [search, setSearch] = useState('');
  const [filterClinic, setFilterClinic] = useState('_all');
  const [filterDoctor, setFilterDoctor] = useState('_all');
  const [filterStatus, setFilterStatus] = useState('_all');
  const [filterDate, setFilterDate] = useState('');
  const [filterCategory, setFilterCategory] = useState('_all');
  const [filterService, setFilterService] = useState('_all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const qc = useQueryClient();

  // ─── Замовлення (головне джерело) ────────────────────────────────────────
  const { data: rawOrders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('WorkOrder')
        .select('*')
        .order('creation_date', { ascending: false });
      if (error) throw error;
      // Діагностика: виводимо перший запис щоб бачити реальні дані
      if (data && data.length > 0) {
        console.log('[Orders] Приклад замовлення:', {
          id: data[0].id,
          clinic_id: data[0].clinic_id,
          clinic_name: data[0].clinic_name,
          doctor_id: data[0].doctor_id,
          doctor_name: data[0].doctor_name,
        });
      }
      return data || [];
    },
  });

  const orders = Array.isArray(rawOrders) ? rawOrders : [];

  // ─── Унікальні клініки — беремо прямо з замовлень (clinic_name + clinic_id)
  // Це гарантує що показуємо тільки ті клініки, по яких є реальні замовлення,
  // і використовуємо точно ті значення що є в БД
  const clinicsList = useMemo(() => {
    const map = new Map();
    orders.forEach(o => {
      if (!o) return;
      const name = o.clinic_name;
      if (name && !map.has(name)) {
        map.set(name, { id: o.clinic_id, name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  // ─── Унікальні лікарі — беремо прямо з замовлень (doctor_name + doctor_id)
  const doctorsList = useMemo(() => {
    const map = new Map();
    orders.forEach(o => {
      if (!o) return;
      const name = o.doctor_name;
      const clinicName = o.clinic_name;
      if (name && !map.has(name)) {
        map.set(name, { id: o.doctor_id, name, clinicName });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  // Лікарі, відфільтровані по обраній клініці
  const filteredDoctorsList = useMemo(() => {
    if (!filterClinic || filterClinic === '_all') return doctorsList;
    return doctorsList.filter(d => d.clinicName === filterClinic);
  }, [doctorsList, filterClinic]);

  // ─── Категорії та послуги з price_item ───────────────────────────────────
  const { data: rawPriceItems } = useQuery({
    queryKey: ['price-items-filter-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('price_item').select('id, name, category').order('name');
      if (error) { console.error('price_item помилка:', error); return []; }
      return data || [];
    }
  });

  const priceItems = Array.isArray(rawPriceItems) ? rawPriceItems : [];

  const categoriesList = useMemo(() => {
    return [...new Set(priceItems.map(p => p.category).filter(Boolean))].sort();
  }, [priceItems]);

  const servicesList = useMemo(() => {
    if (!filterCategory || filterCategory === '_all') return priceItems;
    return priceItems.filter(p => p.category === filterCategory);
  }, [priceItems, filterCategory]);

  // ─── Мутації ──────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (orderId) => {
      const { error } = await supabase.from('WorkOrder').delete().eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setSelectedOrder(null); },
    onError: (err) => { console.error('Помилка видалення:', err); alert('Не вдалося видалити наряд'); }
  });

  const saveMutation = useMutation({
    mutationFn: async (formData) => {
      const rawUserId = user?.id || user?.user_id || '';
      const verifiedUserId = isValidUUID(rawUserId) ? rawUserId.trim() : null;

      const cleanItems = Array.isArray(formData.items) ? formData.items.map(i => {
        const qty = parseInt(i.quantity) || 1;
        const price = parseFloat(i.unit_price) || 0;
        return {
          price_id: safeId(i.price_id),
          price_item_id: safeId(i.price_item_id),
          name: i.name || i.service_name || '',
          category: i.category || '',
          quantity: qty,
          unit_price: price,
          price_currency: i.price_currency || 'UAH',
          technician_price: parseFloat(i.technician_price) || parseFloat(i.technician_pay) || 0,
          teeth: i.teeth || (i.teeth_numbers ? [i.teeth_numbers] : []),
          total: qty * price,
        };
      }) : [];

      const discountPercent =
        parseFloat(formData.manual_discount_percent) ||
        parseFloat(formData.doctor_discount) || 0;
      const { totalInUah, techPayInUah, netProfit } = calculateOrderTotals(cleanItems, discountPercent);

      const finalPayload = {
        clinic_id: safeId(formData.clinic_id),
        doctor_id: safeId(formData.doctor_id),
        technician_id: safeId(formData.technician_id),
        patient_name: formData.patient_name || '',
        patient_age: formData.patient_age ? parseInt(formData.patient_age) : null,
        patient_gender: formData.patient_gender || null,
        tooth_color: formData.tooth_color || '',
        status: formData.status || 'Новий',
        payment_status: formData.payment_status || 'Борг',
        notes: formData.notes || '',
        creation_date: formData.creation_date,
        clinic_name: formData.clinic_name || '',
        doctor_name: formData.doctor_name || '',
        technician_name: formData.technician_name || '',
        expenses: formData.expenses ? parseFloat(formData.expenses) : 0,
        doctor_discount: parseFloat(formData.doctor_discount) || 0,
        manual_discount_percent: parseFloat(formData.manual_discount_percent) || 0,
        paid_amount: parseFloat(formData.paid_amount) || 0,
        paid_currency: formData.paid_currency || 'UAH',
        total_amount: totalInUah,
        technician_total_pay: techPayInUah,
        net_profit: netProfit,
        items: JSON.stringify(cleanItems),
        selected_teeth: formData.selected_teeth || {},
        file_urls: formData.file_urls || [],
        user_id: verifiedUserId,
        due_date: formData.due_date || null,
        completion_date: formData.completion_date || null
      };

      if (editing?.id) {
        const { data, error } = await supabase
          .from('WorkOrder').update(finalPayload).eq('id', editing.id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('WorkOrder')
          .insert([{ ...finalPayload, order_number: formData.order_number || generateOrderNumber() }])
          .select().single();
        if (error) throw error;
        // Запланувати нагадування
        scheduleDeadlineReminder(data);
        return data;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setFormOpen(false); setEditing(null); },
    onError: (error) => { alert(`Не вдалося зберегти наряд: ${error.message}`); }
  });

  // ─── Фільтрація ───────────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (!o) return false;

      // Текстовий пошук
      if (search) {
        const q = search.toLowerCase();
        const match =
          o.patient_name?.toLowerCase().includes(q) ||
          o.order_number?.toLowerCase().includes(q) ||
          o.doctor_name?.toLowerCase().includes(q) ||
          o.clinic_name?.toLowerCase().includes(q);
        if (!match) return false;
      }

      // Клініка — порівнюємо по clinic_name (надійніше ніж uuid)
      if (filterClinic && filterClinic !== '_all') {
        if (o.clinic_name !== filterClinic) return false;
      }

      // Лікар — порівнюємо по doctor_name
      if (filterDoctor && filterDoctor !== '_all') {
        if (o.doctor_name !== filterDoctor) return false;
      }

      // Статус
      if (filterStatus && filterStatus !== '_all' && o.status !== filterStatus) return false;

      // Дата (creation_date може бути timestamptz — беремо тільки дату)
      if (filterDate) {
        const orderDate = o.creation_date
          ? new Date(o.creation_date).toISOString().slice(0, 10)
          : '';
        if (orderDate !== filterDate) return false;
      }

      // Категорія та послуга — парсимо items (text → JSON у БД)
      if ((filterCategory && filterCategory !== '_all') || (filterService && filterService !== '_all')) {
        const items = parseItems(o.items);

        if (filterCategory && filterCategory !== '_all') {
          const hasCategory = items.some(item => item && item.category === filterCategory);
          if (!hasCategory) return false;
        }

        if (filterService && filterService !== '_all') {
          // filterService — uuid з price_item.id
          const targetName = priceItems.find(p => String(p.id) === String(filterService))?.name;
          const hasService = items.some(item =>
            item && (
              String(item.price_item_id || '') === String(filterService) ||
              String(item.price_id || '') === String(filterService) ||
              (targetName && item.name === targetName)
            )
          );
          if (!hasService) return false;
        }
      }

      return true;
    });
  }, [orders, search, filterClinic, filterDoctor, filterStatus, filterDate, filterCategory, filterService, priceItems]);

  const hasFilters = Boolean(
    search ||
    (filterClinic && filterClinic !== '_all') ||
    (filterDoctor && filterDoctor !== '_all') ||
    (filterStatus && filterStatus !== '_all') ||
    filterDate ||
    (filterCategory && filterCategory !== '_all') ||
    (filterService && filterService !== '_all')
  );

  const resetFilters = () => {
    setSearch('');
    setFilterClinic('_all');
    setFilterDoctor('_all');
    setFilterStatus('_all');
    setFilterDate('');
    setFilterCategory('_all');
    setFilterService('_all');
  };

  const handleEdit = (order) => { setEditing(order); setFormOpen(true); };

  const handleDuplicate = (order) => {
    if (!order) return;
    const { id, order_number, created_at, updated_at, ...rest } = order;
    setEditing({ ...rest, status: 'Новий' });
    setFormOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Наряди-замовлення"
          subtitle={`${filteredOrders.length} з ${orders.length} нарядів`}
          onAdd={isAdmin ? () => { setEditing(null); setFormOpen(true); } : undefined}
          addLabel="Новий наряд"
        />
      </div>

      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Пошук по пацієнту, лікарю, клініці, номеру..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={view} onValueChange={setView} className="hidden md:block shrink-0">
            <TabsList>
              <TabsTrigger value="kanban">Канбан</TabsTrigger>
              <TabsTrigger value="list">Список</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap gap-2 items-center">

          {/* Клініка — значення = clinic_name */}
          <Select value={filterClinic} onValueChange={(v) => {
            setFilterClinic(v);
            setFilterDoctor('_all');
          }}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="Всі клініки" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Всі клініки</SelectItem>
              {clinicsList.map(c => (
                <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Лікар — значення = doctor_name, залежить від клініки */}
          <Select value={filterDoctor} onValueChange={setFilterDoctor}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="Всі лікарі" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Всі лікарі</SelectItem>
              {filteredDoctorsList.map(d => (
                <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Статус */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="Всі статуси" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Всі статуси</SelectItem>
              {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Дата */}
          <Input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="h-8 text-xs w-36"
          />

          {/* Категорія */}
          <Select value={filterCategory} onValueChange={(v) => {
            setFilterCategory(v);
            setFilterService('_all');
          }}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue placeholder="Всі категорії" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Всі категорії</SelectItem>
              {categoriesList.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Послуга (залежить від категорії) */}
          <Select value={filterService} onValueChange={setFilterService}>
            <SelectTrigger className="h-8 text-xs w-48">
              <SelectValue placeholder="Всі послуги" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Всі послуги</SelectItem>
              {servicesList.map(p => (
                <SelectItem key={String(p.id)} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs text-muted-foreground">
              <X className="w-3 h-3 mr-1" /> Скинути
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-primary rounded-full animate-spin" />
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard orders={filteredOrders} onOrderClick={setSelectedOrder} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map(order => order && (
            <OrderCard key={order.id} order={order} onClick={setSelectedOrder} />
          ))}
        </div>
      )}

      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          open={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onEdit={isAdmin ? handleEdit : undefined}
          onDuplicate={isAdmin ? handleDuplicate : undefined}
          onDelete={isAdmin ? (id) => deleteMutation.mutate(id) : undefined}
          isAdmin={isAdmin}
        />
      )}

      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) { setFormOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-5xl w-full p-0 overflow-hidden max-h-[95vh] overflow-y-auto">
          <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
            <DialogTitle>{editing ? 'Редагування наряду' : 'Новий наряд-замовлення'}</DialogTitle>
            <DialogDescription>Форма створення або редагування наряду</DialogDescription>
          </span>
          <OrderForm
            order={editing}
            onSubmit={(data) => saveMutation.mutate(data)}
            onCancel={() => { setFormOpen(false); setEditing(null); }}
            isSubmitting={saveMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}