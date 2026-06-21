import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Trash2, Pencil, FlaskConical, User, Phone, Mail, CheckSquare, Square, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const PAYMENT_STATUS_STYLES = {
  'Оплачено': 'bg-emerald-100 text-emerald-700',
  'Частково': 'bg-amber-100 text-amber-700',
  'Борг': 'bg-red-100 text-red-700',
};
const STATUS_STYLES = {
  'В роботі': 'bg-blue-100 text-blue-700',
  'Готово': 'bg-emerald-100 text-emerald-700',
  'Відмінено': 'bg-gray-100 text-gray-500',
};

const emptyOrder = {
  order_date: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
  items: [],
  total_amount: 0,
  payment_status: 'Борг',
  status: 'В роботі',
  technician_id: '_none',
  technician_paid_amount: 0,
};

export default function ProviderProfile({ provider, onBack }) {
  const [orderOpen, setOrderOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [form, setForm] = useState(emptyOrder);
  const [selectedService, setSelectedService] = useState('');
  const [selectedPriceItem, setSelectedPriceItem] = useState('');
  const [selectedTechnicianService, setSelectedTechnicianService] = useState('');
  const [qty, setQty] = useState(1);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  const qc = useQueryClient();

  // === Завантаження даних ===
  const { data: priceItems = [] } = useQuery({
    queryKey: ['priceItems'],
    queryFn: async () => {
      const { data, error } = await supabase.from('price_item').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('technician')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: technicianServices = [] } = useQuery({
    queryKey: ['technicianServices', form.technician_id],
    queryFn: async () => {
      if (!form.technician_id || form.technician_id === '_none') return [];
      const { data, error } = await supabase
        .from('technician_service')
        .select('*')
        .eq('technician_id', form.technician_id)
        .order('service_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!form.technician_id && form.technician_id !== '_none',
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['externalLabOrders', provider.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_lab_order')
        .select('*, technician:technician_id(full_name)')
        .eq('provider_id', provider.id)
        .order('order_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: currentProvider } = useQuery({
    queryKey: ['externalProviders', provider.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_provider')
        .select('*')
        .eq('id', provider.id)
        .single();
      if (error) throw error;
      return data;
    },
    initialData: provider,
  });

  const services = currentProvider?.services || [];

  // === Мутації ===
  const updateProviderMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase
        .from('external_provider')
        .update({ services: data.services })
        .eq('id', provider.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['externalProviders', provider.id] });
      qc.invalidateQueries({ queryKey: ['externalProviders'] });
    },
    onError: (err) => alert(`Помилка: ${err.message}`),
  });

  const saveOrderMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        provider_id: provider.id,
        lab_name: provider.name,
        technician_id: data.technician_id === '_none' ? null : data.technician_id,
      };
      if (editingOrder) {
        const { error } = await supabase
          .from('external_lab_order')
          .update(payload)
          .eq('id', editingOrder.id);
        if (error) throw error;
        return { ...editingOrder, ...payload };
      } else {
        const { data: created, error } = await supabase
          .from('external_lab_order')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        return created;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['externalLabOrders', provider.id] });
      qc.invalidateQueries({ queryKey: ['externalLabOrders'] });
      closeOrder();
    },
    onError: (err) => alert(`Помилка: ${err.message}`),
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('external_lab_order').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['externalLabOrders', provider.id] });
      qc.invalidateQueries({ queryKey: ['externalLabOrders'] });
      setSelectedOrderIds([]);
    },
    onError: (err) => alert(`Помилка видалення: ${err.message}`),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, updates }) => {
      const { error } = await supabase
        .from('external_lab_order')
        .update(updates)
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['externalLabOrders', provider.id] });
      qc.invalidateQueries({ queryKey: ['externalLabOrders'] });
      setSelectedOrderIds([]);
    },
    onError: (err) => alert(`Помилка масового оновлення: ${err.message}`),
  });

  // === Допоміжні функції ===
  const closeOrder = () => {
    setOrderOpen(false);
    setEditingOrder(null);
    setForm(emptyOrder);
    setSelectedService('');
    setSelectedPriceItem('');
    setSelectedTechnicianService('');
    setQty(1);
  };

  const openEditOrder = (order) => {
    setEditingOrder(order);
    setForm({
      order_date: order.order_date || format(new Date(), 'yyyy-MM-dd'),
      notes: order.notes || '',
      items: order.items || [],
      total_amount: order.total_amount || 0,
      payment_status: order.payment_status || 'Борг',
      status: order.status || 'В роботі',
      technician_id: order.technician_id || '_none',
      technician_paid_amount: order.technician_paid_amount || 0,
    });
    setOrderOpen(true);
  };

  const addServiceToProvider = () => {
    if (!newServiceName.trim()) return;
    const updated = [...services, { service_name: newServiceName.trim(), price: Number(newServicePrice) || 0 }];
    updateProviderMutation.mutate({ services: updated });
    setNewServiceName('');
    setNewServicePrice('');
    setServiceOpen(false);
  };

  const removeProviderService = (idx) => {
    const updated = services.filter((_, i) => i !== idx);
    updateProviderMutation.mutate({ services: updated });
  };

  const addItemFromService = () => {
    const svc = services[selectedService];
    if (!svc) return;
    const newItem = {
      service_name: svc.service_name,
      quantity: qty,
      unit_price: svc.price,
      total: svc.price * qty,
      technician_pay: 0,
    };
    const newItems = [...form.items, newItem];
    setForm({ ...form, items: newItems, total_amount: newItems.reduce((s, i) => s + i.total, 0) });
    setSelectedService('');
    setQty(1);
  };

  const addItemFromPriceList = () => {
    const pi = priceItems.find(p => p.id === selectedPriceItem);
    if (!pi) return;
    const price = pi.technician_pay || pi.client_price || 0;
    const newItem = {
      price_item_id: pi.id,
      service_name: pi.name,
      quantity: qty,
      unit_price: price,
      total: price * qty,
      technician_pay: pi.technician_pay || 0,
    };
    const newItems = [...form.items, newItem];
    setForm({ ...form, items: newItems, total_amount: newItems.reduce((s, i) => s + i.total, 0) });
    setSelectedPriceItem('');
    setQty(1);
  };

  // === ВИПРАВЛЕНО: послуга техніка додається з ціною 0 для клієнта, але зберігає technician_pay ===
  const addItemFromTechnicianService = () => {
    const ts = technicianServices.find(s => s.id === selectedTechnicianService);
    if (!ts) return;
    const price = ts.technician_pay || ts.price || 0;
    const newItem = {
      technician_service_id: ts.id,
      service_name: `[Технік] ${ts.service_name}`,
      quantity: qty,
      unit_price: 0,          // ← НЕ додаємо до загальної суми
      total: 0,               // ← НЕ додаємо до загальної суми
      technician_pay: price,  // ← зберігаємо для внутрішнього обліку
    };
    const newItems = [...form.items, newItem];
    setForm({ ...form, items: newItems, total_amount: newItems.reduce((s, i) => s + i.total, 0) });
    setSelectedTechnicianService('');
    setQty(1);
  };

  const removeItem = (idx) => {
    const newItems = form.items.filter((_, i) => i !== idx);
    setForm({ ...form, items: newItems, total_amount: newItems.reduce((s, i) => s + i.total, 0) });
  };

  const toggleSelectOrder = (orderId) => {
    setSelectedOrderIds(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === orders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(orders.map(o => o.id));
    }
  };

  const handleBulkStatusChange = (field, value) => {
    if (selectedOrderIds.length === 0) return;
    bulkUpdateMutation.mutate({ ids: selectedOrderIds, updates: { [field]: value } });
  };

  const totalDebt = orders.filter(o => o.payment_status === 'Борг').reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalSpent = orders.reduce((s, o) => s + (o.total_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            {currentProvider?.type === 'Лабораторія' ? <FlaskConical className="w-5 h-5" /> : <User className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{currentProvider?.name}</h1>
            <Badge variant="secondary">{currentProvider?.type}</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-medium">Контакти</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {currentProvider?.phone && (
                <div className="flex items-center gap-2 text-sm"><Phone className="w-4 h-4 text-muted-foreground" /> {currentProvider.phone}</div>
              )}
              {currentProvider?.email && (
                <div className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-muted-foreground" /> {currentProvider.email}</div>
              )}
              {currentProvider?.notes && (
                <p className="text-sm text-muted-foreground border-t pt-2 mt-2">{currentProvider.notes}</p>
              )}
              {!currentProvider?.phone && !currentProvider?.email && !currentProvider?.notes && (
                <p className="text-sm text-muted-foreground">Контакти не вказані</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground font-medium">Послуги</CardTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setServiceOpen(true)}>
                <Plus className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {services.length === 0 ? (
                <p className="text-sm text-muted-foreground">Немає послуг. Додайте послуги, щоб обирати їх при створенні замовлень.</p>
              ) : (
                <div className="space-y-1">
                  {services.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1.5 border-b last:border-0 group">
                      <div>
                        <p className="text-sm font-medium">{s.service_name}</p>
                        <p className="text-xs text-muted-foreground">{s.price ? `${s.price.toFixed(2)} ₴` : 'Ціна не вказана'}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100" onClick={() => removeProviderService(idx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Всього замовлень</span>
                <span className="font-semibold">{orders.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Загальна сума</span>
                <span className="font-semibold">{totalSpent.toFixed(2)} ₴</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Борг</span>
                <span className={`font-semibold ${totalDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{totalDebt.toFixed(2)} ₴</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold">Замовлення</h2>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setOrderOpen(true)}><Plus className="w-4 h-4 mr-1" /> Нове замовлення</Button>
            </div>
          </div>

          {selectedOrderIds.length > 0 && (
            <div className="bg-muted/50 p-3 rounded-lg mb-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Вибрано {selectedOrderIds.length} замовлень:</span>
              <Select onValueChange={(v) => handleBulkStatusChange('payment_status', v)}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Статус оплати" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Оплачено">Оплачено</SelectItem>
                  <SelectItem value="Частково">Частково</SelectItem>
                  <SelectItem value="Борг">Борг</SelectItem>
                </SelectContent>
              </Select>
              <Select onValueChange={(v) => handleBulkStatusChange('status', v)}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="В роботі">В роботі</SelectItem>
                  <SelectItem value="Готово">Готово</SelectItem>
                  <SelectItem value="Відмінено">Відмінено</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setSelectedOrderIds([])}>Скасувати</Button>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-8">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleSelectAll}>
                          {selectedOrderIds.length === orders.length && orders.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </Button>
                      </TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Поз.</TableHead>
                      <TableHead className="text-right">Сума</TableHead>
                      <TableHead>Технік</TableHead>
                      <TableHead>Оплата</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Немає замовлень</TableCell></TableRow>
                    ) : (
                      orders.map(order => (
                        <TableRow key={order.id} className="group">
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleSelectOrder(order.id)}>
                              {selectedOrderIds.includes(order.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="text-sm">{order.order_date ? format(parseISO(order.order_date), 'dd.MM.yyyy') : '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{(order.items || []).length} поз.</TableCell>
                          <TableCell className="text-right font-semibold text-sm">{(order.total_amount || 0).toFixed(2)} ₴</TableCell>
                          <TableCell className="text-sm">{order.technician?.full_name || 'Не призначено'}</TableCell>
                          <TableCell><Badge className={PAYMENT_STATUS_STYLES[order.payment_status] || PAYMENT_STATUS_STYLES['Борг']}>{order.payment_status || 'Борг'}</Badge></TableCell>
                          <TableCell><Badge className={STATUS_STYLES[order.status] || STATUS_STYLES['В роботі']}>{order.status || 'В роботі'}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditOrder(order)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteOrderMutation.mutate(order.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={serviceOpen} onOpenChange={setServiceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Додати послугу</DialogTitle>
            <DialogDescription>Введіть назву та ціну нової послуги.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Назва послуги *</Label>
              <Input value={newServiceName} onChange={e => setNewServiceName(e.target.value)} placeholder="Наприклад: Металокераміка" autoFocus />
            </div>
            <div>
              <Label>Ціна (₴)</Label>
              <Input type="number" min="0" step="0.01" value={newServicePrice} onChange={e => setNewServicePrice(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setServiceOpen(false)}>Скасувати</Button>
              <Button onClick={addServiceToProvider} disabled={!newServiceName.trim()}>Додати</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={orderOpen} onOpenChange={(v) => { if (!v) closeOrder(); else setOrderOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'Редагувати замовлення' : `Нове замовлення — ${provider.name}`}</DialogTitle>
            <DialogDescription>Заповніть дані замовлення для зовнішньої лабораторії.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveOrderMutation.mutate(form); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Дата *</Label>
                <Input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} required />
              </div>
              <div>
                <Label>Технік</Label>
                <Select value={form.technician_id} onValueChange={v => setForm({ ...form, technician_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Оберіть техніка" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Не призначено</SelectItem>
                    {technicians.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <p className="text-sm font-medium">Додати послугу</p>

              {services.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2 border-b mb-2">
                  {services.map((s, idx) => (
                    <Button
                      key={idx}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1"
                      onClick={() => {
                        const newItem = {
                          service_name: s.service_name,
                          quantity: 1,
                          unit_price: s.price,
                          total: s.price,
                          technician_pay: 0,
                        };
                        const newItems = [...form.items, newItem];
                        setForm({
                          ...form,
                          items: newItems,
                          total_amount: newItems.reduce((sum, i) => sum + i.total, 0),
                        });
                      }}
                    >
                      {s.service_name} ({s.price}₴)
                    </Button>
                  ))}
                </div>
              )}

              {services.length > 0 && (
                <div className="flex gap-2 flex-wrap items-end">
                  <div className="flex-1 min-w-48">
                    <Label className="text-xs">Послуги лабораторії</Label>
                    <Select value={selectedService} onValueChange={setSelectedService}>
                      <SelectTrigger><SelectValue placeholder="Оберіть послугу" /></SelectTrigger>
                      <SelectContent>
                        {services.map((s, i) => (
                          <SelectItem key={i} value={String(i)}>{s.service_name} — {s.price} ₴</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">К-сть</Label>
                    <Input type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} />
                  </div>
                  <Button type="button" size="sm" onClick={addItemFromService} disabled={!selectedService}>
                    <Plus className="w-4 h-4 mr-1" /> Додати
                  </Button>
                </div>
              )}

              <div className="flex gap-2 flex-wrap items-end border-t pt-3">
                <div className="flex-1 min-w-48">
                  <Label className="text-xs">З загального прайс-листа</Label>
                  <Select value={selectedPriceItem} onValueChange={setSelectedPriceItem}>
                    <SelectTrigger><SelectValue placeholder="Оберіть послугу" /></SelectTrigger>
                    <SelectContent>
                      {priceItems.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} — {p.technician_pay || p.client_price} ₴</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-20">
                  <Label className="text-xs">К-сть</Label>
                  <Input type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} />
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addItemFromPriceList} disabled={!selectedPriceItem}>
                  <Plus className="w-4 h-4 mr-1" /> Додати
                </Button>
              </div>

              {form.technician_id !== '_none' && technicianServices.length > 0 && (
                <div className="flex gap-2 flex-wrap items-end border-t pt-3 mt-2 border-dashed border-blue-200">
                  <div className="flex-1 min-w-48">
                    <Label className="text-xs text-blue-600 flex items-center gap-1">
                      <Users className="w-3 h-3" /> Послуги техніка (без впливу на суму)
                    </Label>
                    <p className="text-xs text-muted-foreground">(ціна вже включена в основну послугу)</p>
                    <Select value={selectedTechnicianService} onValueChange={setSelectedTechnicianService}>
                      <SelectTrigger><SelectValue placeholder="Оберіть послугу техніка" /></SelectTrigger>
                      <SelectContent>
                        {technicianServices.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.service_name} — {s.technician_pay || s.price || 0} ₴
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">К-сть</Label>
                    <Input type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={addItemFromTechnicianService}
                    disabled={!selectedTechnicianService}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Додати техніку (0₴)
                  </Button>
                </div>
              )}

              {form.technician_id !== '_none' && technicianServices.length === 0 && (
                <p className="text-xs text-muted-foreground border-t pt-3 mt-2">
                  У цього техніка немає доданих послуг. Додайте послуги в розділі "Техніки".
                </p>
              )}

              {form.items.length > 0 && (
                <table className="w-full text-sm mt-2">
                  <thead>
                    <tr className="text-muted-foreground text-xs border-b">
                      <th className="text-left pb-1">Послуга</th>
                      <th className="text-right pb-1">К-сть</th>
                      <th className="text-right pb-1">Ціна</th>
                      <th className="text-right pb-1">Сума</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-1.5">
                          {item.service_name}
                          {item.total === 0 && item.technician_pay > 0 && (
                            <span className="text-[10px] text-blue-500 ml-1">(технік, 0₴)</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right">{item.quantity}</td>
                        <td className="py-1.5 text-right">{Number(item.unit_price).toFixed(2)} ₴</td>
                        <td className="py-1.5 text-right font-medium">{Number(item.total).toFixed(2)} ₴</td>
                        <td className="py-1.5 text-right">
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(idx)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td colSpan={3} className="pt-2 text-right">Разом:</td>
                      <td className="pt-2 text-right">{Number(form.total_amount).toFixed(2)} ₴</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Статус оплати</Label>
                <Select value={form.payment_status} onValueChange={v => setForm({ ...form, payment_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Оплачено">Оплачено</SelectItem>
                    <SelectItem value="Частково">Частково</SelectItem>
                    <SelectItem value="Борг">Борг</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Статус</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="В роботі">В роботі</SelectItem>
                    <SelectItem value="Готово">Готово</SelectItem>
                    <SelectItem value="Відмінено">Відмінено</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Примітки</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeOrder}>Скасувати</Button>
              <Button type="submit" disabled={saveOrderMutation.isPending}>{saveOrderMutation.isPending ? 'Збереження...' : 'Зберегти'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}