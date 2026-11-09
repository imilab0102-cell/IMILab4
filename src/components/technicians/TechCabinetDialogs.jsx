import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, X } from 'lucide-react';

const today = () => format(new Date(), 'yyyy-MM-dd');

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

function TeethSelect({ value, onChange }) {
  const toggle = (n) => onChange(value.includes(n) ? value.filter(t => t !== n) : [...value, n]);
  const row = (teeth) => (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
      {teeth.map(n => (
        <button
          type="button" key={n} onClick={() => toggle(n)}
          className={`h-8 rounded text-[10px] font-semibold border ${value.includes(n) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground'}`}
        >{n}</button>
      ))}
    </div>
  );
  return <div className="space-y-1">{row(UPPER)}{row(LOWER)}</div>;
}

// ─── Новий наряд від техніка ────────────────────────────────────────────────
export function NewOrderDialog({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    clinic_id: '', doctor_id: '', patient_name: '', patient_age: '', patient_gender: '',
    due_date: '', tooth_color: '', notes: '', selected_teeth: [], items: [],
  });
  const [svc, setSvc] = useState('');
  const [qty, setQty] = useState(1);
  const [svcTeeth, setSvcTeeth] = useState('');

  const { data: lists, isLoading } = useQuery({
    queryKey: ['tech-order-lists'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_order_form_lists');
      if (error) throw error;
      return data || { clinics: [], doctors: [], services: [] };
    },
  });

  const doctors = useMemo(
    () => (lists?.doctors || []).filter(d => !form.clinic_id || String(d.clinic_id) === form.clinic_id),
    [lists, form.clinic_id]
  );
  const serviceName = (id) => (lists?.services || []).find(s => s.id === id)?.name || '';

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_my_order', {
        p: {
          ...form,
          selected_teeth: form.selected_teeth.map(String),
          items: form.items.map(i => ({ price_item_id: i.price_item_id, quantity: i.quantity, teeth: i.teeth })),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-orders'] }); onClose(); },
    onError: (e) => alert(e.message?.includes('missing_patient') ? 'Вкажіть ПІБ пацієнта' : `Не вдалося створити наряд: ${e.message}`),
  });

  const addItem = () => {
    if (!svc) return;
    setForm(f => ({ ...f, items: [...f.items, { price_item_id: svc, quantity: Math.max(1, parseInt(qty) || 1), teeth: svcTeeth.trim() }] }));
    setSvc(''); setQty(1); setSvcTeeth('');
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новий наряд</DialogTitle>
          <DialogDescription>Ціни підставить власник лабораторії. Наряд буде призначено вам.</DialogDescription>
        </DialogHeader>
        {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Клініка</Label>
                <Select value={form.clinic_id} onValueChange={v => setForm({ ...form, clinic_id: v, doctor_id: '' })}>
                  <SelectTrigger><SelectValue placeholder="Оберіть" /></SelectTrigger>
                  <SelectContent>{(lists?.clinics || []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Лікар</Label>
                <Select value={form.doctor_id} onValueChange={v => setForm({ ...form, doctor_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Оберіть" /></SelectTrigger>
                  <SelectContent>{doctors.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>ПІБ пацієнта *</Label>
              <Input value={form.patient_name} onChange={e => setForm({ ...form, patient_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label>Вік</Label><Input inputMode="numeric" value={form.patient_age} onChange={e => setForm({ ...form, patient_age: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></div>
              <div className="space-y-1">
                <Label>Стать</Label>
                <Select value={form.patient_gender} onValueChange={v => setForm({ ...form, patient_gender: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="Чоловік">Чоловік</SelectItem><SelectItem value="Жінка">Жінка</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Колір</Label><Input value={form.tooth_color} onChange={e => setForm({ ...form, tooth_color: e.target.value })} placeholder="A2" /></div>
            </div>
            <div className="space-y-1"><Label>Дата здачі</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Зуби</Label>
              <TeethSelect value={form.selected_teeth} onChange={t => setForm({ ...form, selected_teeth: t })} />
            </div>

            <div className="space-y-2 rounded-md border p-2">
              <Label>Роботи</Label>
              {form.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{serviceName(it.price_item_id)}{it.teeth ? ` (${it.teeth})` : ''} × {it.quantity}</span>
                  <button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
              ))}
              <Select value={svc} onValueChange={setSvc}>
                <SelectTrigger><SelectValue placeholder="Оберіть роботу з прайсу" /></SelectTrigger>
                <SelectContent>
                  {(lists?.services || []).map(s => <SelectItem key={s.id} value={s.id}>{s.category ? `${s.category} · ` : ''}{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input className="w-20" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value.replace(/\D/g, ''))} placeholder="К-сть" />
                <Input className="flex-1" value={svcTeeth} onChange={e => setSvcTeeth(e.target.value)} placeholder="Зуби, напр. 14, 15" />
                <Button type="button" variant="outline" onClick={addItem} disabled={!svc}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>

            <div className="space-y-1"><Label>Примітки</Label><Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>

            <Button className="w-full" disabled={create.isPending || form.patient_name.trim().length < 2} onClick={() => create.mutate()}>
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Створити наряд'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Робота в зовнішню лабораторію ──────────────────────────────────────────
export function NewExternalDialog({ onClose }) {
  const qc = useQueryClient();
  const [providerId, setProviderId] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [svc, setSvc] = useState('');
  const [qty, setQty] = useState(1);

  const { data: providers = [] } = useQuery({
    queryKey: ['tech-providers'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_external_providers_min');
      if (error) throw error;
      return data || [];
    },
  });
  const { data: services = [] } = useQuery({
    queryKey: ['my-services'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_services');
      if (error) throw error;
      return data || [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('create_my_external_order', {
        p_provider_id: parseInt(providerId), p_order_date: date, p_notes: notes,
        p_items: items.map(i => ({ service_id: i.service_id, quantity: i.quantity })),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-external'] }); onClose(); },
    onError: (e) => alert(`Не вдалося зберегти: ${e.message}`),
  });

  const svcName = (id) => services.find(s => s.id === id)?.service_name || '';

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Робота в зовнішню лабораторію</DialogTitle>
          <DialogDescription>Оберіть лабораторію і свої послуги — оплата піде у ваш заробіток.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Лабораторія</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder="Оберіть" /></SelectTrigger>
              <SelectContent>{providers.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Дата</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="space-y-2 rounded-md border p-2">
            <Label>Мої послуги</Label>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{svcName(it.service_id)} × {it.quantity}</span>
                <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))}><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
            ))}
            {services.length === 0 ? (
              <p className="text-xs text-muted-foreground">У вас ще немає послуг. Їх додає власник лабораторії.</p>
            ) : (
              <div className="flex gap-2">
                <Select value={svc} onValueChange={setSvc}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Послуга" /></SelectTrigger>
                  <SelectContent>{services.map(s => <SelectItem key={s.id} value={s.id}>{s.service_name}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="w-16" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value.replace(/\D/g, ''))} />
                <Button type="button" variant="outline" disabled={!svc}
                  onClick={() => { setItems([...items, { service_id: svc, quantity: Math.max(1, parseInt(qty) || 1) }]); setSvc(''); setQty(1); }}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1"><Label>Примітки</Label><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <Button className="w-full" disabled={!providerId || !items.length || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Зберегти'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Коригування зарплати ───────────────────────────────────────────────────
export function AdjustmentForm() {
  const qc = useQueryClient();
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('create_my_adjustment', { p_description: desc, p_amount: parseFloat(String(amount).replace(',', '.')) });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-adjustments'] }); setDesc(''); setAmount(''); },
    onError: (e) => alert(`Не вдалося додати: ${e.message}`),
  });
  const valid = desc.trim().length >= 2 && !isNaN(parseFloat(String(amount).replace(',', '.'))) && parseFloat(String(amount).replace(',', '.')) !== 0;
  return (
    <div className="space-y-2">
      <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="За що (напр. переробка, бонус)" />
      <div className="flex gap-2">
        <Input className="flex-1" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Сума, ₴ (мінус — утримання)" />
        <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Додати'}
        </Button>
      </div>
    </div>
  );
}
