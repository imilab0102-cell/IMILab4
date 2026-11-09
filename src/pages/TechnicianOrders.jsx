import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import StatusBadge from '@/components/StatusBadge';
import { ORDER_STATUSES } from '@/lib/constants';
import { withDefaults } from '@/lib/technicianPermissions';
import { Textarea } from '@/components/ui/textarea';
import { NewOrderDialog, AdjustmentForm } from '@/components/technicians/TechCabinetDialogs';
import ExternalLab from '@/pages/ExternalLab';
import { format, getMonth, getYear, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Search, Calendar, UserRound, Building2, FileText, LogOut, TrendingUp, Loader2, Paperclip, Wallet, ListChecks, FlaskConical, Plus, Trash2 } from 'lucide-react';

// Технік бачить лише свої наряди і свій заробіток.
// Ціни для клініки, суми нарядів, оплати та фінанси лабораторії сюди не потрапляють:
// дані приходять із функцій бази get_my_*, які ці поля не віддають.

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i),
  label: format(new Date(2024, i, 1), 'LLLL', { locale: uk }),
}));
const THIS_YEAR = getYear(new Date());
const YEARS = Array.from({ length: THIS_YEAR - 2023 }, (_, i) => 2024 + i);

const TECH_STATUSES = ['В роботі', 'На примірці', 'Готовий'];
const LOCKED = ['Зданий', 'Скасований'];

const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('uk-UA')} ₴`;
const fmt = (d, pattern = 'dd.MM.yyyy') => {
  if (!d) return '—';
  try { return format(typeof d === 'string' ? parseISO(d) : d, pattern, { locale: uk }); } catch { return '—'; }
};
const parseJson = (v, fallback) => {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

function OrderDialog({ order, onClose, perms }) {
  const qc = useQueryClient();
  const items = Array.isArray(order.items) ? order.items : [];
  const teeth = (order.selected_teeth || []).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  const shades = parseJson(order.tooth_shades, {});
  const files = (() => {
    const f = parseJson(order.file_urls, []);
    return Array.isArray(f) ? f.filter(Boolean) : [];
  })();

  const setStatus = useMutation({
    mutationFn: async (status) => {
      const { error } = await supabase.rpc('set_my_order_status', { p_id: String(order.id), p_status: status });
      if (error) throw error;
      return status;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-orders'] }); onClose(); },
    onError: (e) => alert(`Не вдалося змінити статус: ${e.message}`),
  });

  const [note, setNote] = useState('');
  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('add_my_order_note', { p_id: String(order.id), p_text: note });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-orders'] }); onClose(); },
    onError: (e) => alert(`Не вдалося додати примітку: ${e.message}`),
  });

  const locked = LOCKED.includes(order.status);
  const mine = order.is_mine !== false;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {order.patient_name || 'Без імені'} <StatusBadge status={order.status} />
          </DialogTitle>
          <DialogDescription>
            {[order.order_number, order.clinic_name, order.doctor_name, !mine && order.technician_name && `технік: ${order.technician_name}`].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Створено:</span> {fmt(order.creation_date)}</div>
            <div><span className="text-muted-foreground">Здача:</span> <b>{fmt(order.due_date)}</b></div>
            {(order.patient_age || order.patient_gender) && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Пацієнт:</span>{' '}
                {[order.patient_age && `${order.patient_age} р.`, order.patient_gender].filter(Boolean).join(', ')}
              </div>
            )}
            {order.tooth_color && <div className="col-span-2"><span className="text-muted-foreground">Колір:</span> <b>{order.tooth_color}</b></div>}
          </div>

          {teeth.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Зуби</p>
              <div className="flex flex-wrap gap-1">
                {teeth.map(t => {
                  const sh = shades?.[t] || shades?.[String(t)];
                  const shadeText = sh ? [sh.neck, sh.body, sh.incisal].filter(Boolean).join(' / ') : '';
                  return (
                    <span key={t} className="text-xs rounded-md border px-2 py-0.5 bg-muted/50">
                      {t}{shadeText ? ` · ${shadeText}` : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Роботи</p>
              <div className="divide-y rounded-lg border">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="flex-1">{it.service_name || 'Послуга'}{it.quantity > 1 ? ` × ${it.quantity}` : ''}</span>
                    {Number(it.technician_pay) > 0 && (
                      <span className="text-xs font-semibold text-emerald-700">{money(it.technician_pay * (it.quantity || 1))}</span>
                    )}
                  </div>
                ))}
              </div>
              {Number(order.my_pay) > 0 && (
                <p className="text-right text-sm mt-1">Мій заробіток: <b className="text-emerald-700">{money(order.my_pay)}</b></p>
              )}
            </div>
          )}

          {order.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Примітки</p>
              <p className="whitespace-pre-wrap bg-muted/40 rounded-lg p-2">{order.notes}</p>
            </div>
          )}

          {files.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" /> Файли</p>
              <div className="flex flex-wrap gap-2">
                {files.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="text-xs underline text-primary">Файл {i + 1}</a>
                ))}
              </div>
            </div>
          )}

          {mine && perms.add_notes && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Додати примітку</p>
              <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Напр.: потрібен новий відбиток" />
              <Button size="sm" variant="outline" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                {addNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Додати'}
              </Button>
            </div>
          )}

          {mine && perms.change_status && (
          <div className="pt-2 border-t">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Змінити статус</p>
            {locked ? (
              <p className="text-xs text-muted-foreground">Наряд «{order.status}» — статус змінює лише власник.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {TECH_STATUSES.map(s => (
                  <Button
                    key={s}
                    size="sm"
                    variant={order.status === s ? 'default' : 'outline'}
                    disabled={setStatus.isPending || order.status === s}
                    onClick={() => setStatus.mutate(s)}
                  >
                    {setStatus.isPending && setStatus.variables === s ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : s}
                  </Button>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TechnicianOrders() {
  const { user } = useAuth();
  const isTechnician = user?.role === 'technician';
  const perms = withDefaults(user?.permissions);
  const [scope, setScope] = useState('mine');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const qcMain = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('orders');

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(getMonth(now)));
  const [selectedYear, setSelectedYear] = useState(String(getYear(now)));

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['my-orders'],
    enabled: isTechnician,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_orders');
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['my-services'],
    enabled: isTechnician && activeTab === 'services' && perms.see_services,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_services');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['my-salary-payments'],
    enabled: isTechnician && activeTab === 'money' && perms.see_earnings,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_salary_payments');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: adjustments = [] } = useQuery({
    queryKey: ['my-adjustments'],
    enabled: isTechnician && activeTab === 'money' && perms.see_earnings,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_adjustments');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: externalOrders = [] } = useQuery({
    queryKey: ['my-external'],
    enabled: isTechnician && (activeTab === 'money' || activeTab === 'external'),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_external_orders');
      if (error) throw error;
      return data || [];
    },
  });

  const deleteAdjustment = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('delete_my_adjustment', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qcMain.invalidateQueries({ queryKey: ['my-adjustments'] }),
    onError: (e) => alert(`Не вдалося видалити: ${e.message}`),
  });

  // Як у звіті власника: позиції нарядів за датою позиції, зовнішні лаби за датою,
  // коригування за датою створення. «До виплати» — усе, що ще не виплачено.
  const earnings = useMemo(() => {
    const start = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth), 1));
    const end = endOfMonth(start);
    const inP = (d) => {
      if (!d) return false;
      try { return isWithinInterval(parseISO(String(d).slice(0, 10)), { start, end }); } catch { return false; }
    };

    const orderRows = [];
    let unpaid = 0;
    orders.forEach(o => {
      if (o.is_mine === false || o.status === 'Скасований') return;
      (o.items || []).forEach(it => {
        const pay = (Number(it.technician_pay) || 0) * (Number(it.quantity) || 1);
        if (!pay) return;
        if (!it.is_paid) unpaid += pay;
        if (inP(it.date || o.creation_date)) orderRows.push({ key: `${o.id}-${orderRows.length}`, label: o.order_number, sub: `${o.patient_name || ''} · ${it.service_name || ''}`, amount: pay });
      });
    });

    const extRows = [];
    externalOrders.forEach(e => {
      const pay = Number(e.my_pay) || 0;
      if (!pay) return;
      unpaid += Math.max(0, pay - (Number(e.paid_amount) || 0));
      if (inP(e.order_date)) extRows.push({ key: `e${e.id}`, label: e.lab_name || 'Зовн. лаб.', sub: (e.items || []).map(i => i.service_name).join(', '), amount: pay });
    });

    const adjRows = [];
    adjustments.forEach(a => {
      const amt = Number(a.amount) || 0;
      if (!a.is_paid) unpaid += amt;
      if (inP(a.created_at)) adjRows.push({ key: `a${a.id}`, label: 'Коригування', sub: a.description, amount: amt });
    });

    const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);
    const ordersSum = sum(orderRows), extSum = sum(extRows), adjSum = sum(adjRows);
    return {
      ordersSum, extSum, adjSum,
      total: ordersSum + extSum + adjSum,
      unpaid,
      rows: [...orderRows, ...extRows, ...adjRows],
    };
  }, [orders, externalOrders, adjustments, selectedMonth, selectedYear]);

  const filteredOrders = useMemo(() => orders.filter(o => {
    if (scope === 'mine' && o.is_mine === false) return false;
    if (statusFilter === 'active' && LOCKED.includes(o.status)) return false;
    if (statusFilter !== 'active' && statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.patient_name?.toLowerCase().includes(q) || o.order_number?.toLowerCase().includes(q)
        || o.clinic_name?.toLowerCase().includes(q) || o.doctor_name?.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    // спершу ті, що здавати раніше
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  }), [orders, statusFilter, search, scope]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  if (!isTechnician) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <UserRound className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Профіль техніка не знайдено</h2>
        <p className="text-muted-foreground max-w-sm">
          Ваш акаунт не прив'язано до профілю техніка. Зверніться до власника лабораторії.
        </p>
        <Button variant="outline" className="mt-4 gap-2" onClick={handleLogout}>
          <LogOut className="w-4 h-4" /> Вийти
        </Button>
      </div>
    );
  }

  const unpaidAdjustments = adjustments.filter(a => !a.is_paid);
  const tabBtn = (key, label, Icon) => (
    <button
      onClick={() => setActiveTab(key)}
      className={`px-3 py-2 font-medium border-b-2 transition-colors flex items-center gap-1.5 text-sm ${
        activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="w-4 h-4" />{label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold font-heading">Мій кабінет</h1>
        <p className="text-sm text-muted-foreground">
          {user.full_name}{user.specialization ? ` • ${user.specialization}` : ''}
        </p>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {tabBtn('orders', 'Мої наряди', FileText)}
        {perms.see_earnings && tabBtn('money', 'Заробіток', Wallet)}
        {perms.add_external && tabBtn('external', 'Зовнішні лаби', FlaskConical)}
        {perms.see_services && tabBtn('services', 'Мої послуги', ListChecks)}
      </div>

      {activeTab === 'orders' && (
        <div className="space-y-3">
          {perms.create_orders && (
            <Button className="w-full gap-2" onClick={() => setNewOrderOpen(true)}><Plus className="w-4 h-4" /> Новий наряд</Button>
          )}
          {perms.see_all_orders && (
            <div className="flex gap-2">
              <Button size="sm" variant={scope === 'mine' ? 'default' : 'outline'} onClick={() => setScope('mine')}>Мої</Button>
              <Button size="sm" variant={scope === 'all' ? 'default' : 'outline'} onClick={() => setScope('all')}>Усі наряди лабораторії</Button>
            </div>
          )}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активні</SelectItem>
                <SelectItem value="all">Всі</SelectItem>
                {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>Нарядів не знайдено</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map(order => (
                <Card key={order.id} className="cursor-pointer hover:shadow-md active:scale-[0.99] transition-all" onClick={() => setSelectedOrder(order)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-mono text-muted-foreground">{order.order_number}</span>
                        <h3 className="font-semibold mt-0.5 truncate">{order.patient_name}</h3>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {perms.see_clinic_doctor && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{order.clinic_name || '—'}</span>}
                      {perms.see_clinic_doctor && <span className="flex items-center gap-1"><UserRound className="w-3 h-3" />{order.doctor_name || '—'}</span>}
                      {order.is_mine === false && <span className="flex items-center gap-1">технік: {order.technician_name || '—'}</span>}
                      {order.due_date && (
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <Calendar className="w-3 h-3" />здача {fmt(order.due_date, 'd MMM')}
                        </span>
                      )}
                    </div>
                    {(order.items?.length > 0 || Number(order.my_pay) > 0) && (
                      <div className="mt-2 pt-2 border-t flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{order.items?.length || 0} робіт</span>
                        {Number(order.my_pay) > 0 && <span className="font-semibold text-emerald-700">{money(order.my_pay)}</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'money' && (
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /> Мій заробіток</CardTitle>
                <div className="flex gap-2">
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/80 dark:bg-card rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Разом за місяць</p>
                  <p className="text-2xl font-bold text-emerald-700">{money(earnings.total)}</p>
                </div>
                <div className="bg-white/80 dark:bg-card rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">До виплати (усього)</p>
                  <p className="text-2xl font-bold text-primary">{money(earnings.unpaid)}</p>
                </div>
              </div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Наряди</span><span>{money(earnings.ordersSum)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Зовнішні лабораторії</span><span>{money(earnings.extSum)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Коригування</span><span className={earnings.adjSum < 0 ? 'text-red-600' : ''}>{money(earnings.adjSum)}</span></div>
              </div>
              {earnings.rows.length > 0 && (
                <div className="pt-2 border-t space-y-1 max-h-56 overflow-y-auto">
                  {earnings.rows.map(r => (
                    <div key={r.key} className="flex justify-between gap-2 text-xs">
                      <span className="font-mono text-muted-foreground shrink-0">{r.label}</span>
                      <span className="flex-1 truncate">{r.sub}</span>
                      <span className={`font-semibold ${r.amount < 0 ? 'text-red-600' : ''}`}>{money(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground pt-2 border-t">Наряди — за датою роботи, без скасованих; зовнішні лаби — за датою замовлення.</p>
            </CardContent>
          </Card>

          {(perms.adjust_salary || unpaidAdjustments.length > 0) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Коригування (ще не виплачені)</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {unpaidAdjustments.length === 0 && <p className="text-xs text-muted-foreground">Немає.</p>}
                {unpaidAdjustments.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-2">
                    <span className="flex-1">{a.description || 'Коригування'}</span>
                    <span className={Number(a.amount) < 0 ? 'text-red-600' : 'text-emerald-700'}>{money(a.amount)}</span>
                    {perms.adjust_salary && String(a.description || '').startsWith('[від техніка]') && (
                      <button onClick={() => { if (window.confirm('Видалити коригування?')) deleteAdjustment.mutate(a.id); }}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                ))}
                {perms.adjust_salary && <div className="pt-2 border-t"><AdjustmentForm /></div>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Виплати</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {payments.length === 0 ? (
                <p className="text-muted-foreground text-xs">Виплат ще не було.</p>
              ) : payments.map(p => (
                <div key={p.id} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{fmt(p.paid_at)}</span>
                  <span className="flex-1 text-xs truncate">{fmt(p.period_start)} – {fmt(p.period_end)}{p.note ? ` · ${p.note}` : ''}</span>
                  <span className="font-semibold">{money(p.total_amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'external' && perms.add_external && <ExternalLab />}

      {activeTab === 'services' && (
        <Card>
          <CardContent className="p-0">
            {services.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Послуг ще не додано. Їх налаштовує власник лабораторії.</p>
            ) : (
              <div className="divide-y">
                {services.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{s.service_name}</p>
                      {s.category && <p className="text-xs text-muted-foreground">{s.category}</p>}
                    </div>
                    <span className="font-semibold text-emerald-700 shrink-0">{money(s.technician_pay)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {newOrderOpen && <NewOrderDialog onClose={() => setNewOrderOpen(false)} />}
      {selectedOrder && <OrderDialog order={selectedOrder} perms={perms} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}
