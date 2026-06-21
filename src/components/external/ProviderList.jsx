import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, FlaskConical, User, Phone, Mail, ChevronRight, Download, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const emptyForm = { name: '', type: 'Технік', phone: '', email: '', notes: '', file_url: '' };

export default function ProviderList({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const qc = useQueryClient();

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['externalProviders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('external_provider').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['externalLabOrders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('external_lab_order').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editing) {
        const { error } = await supabase.from('external_provider').update(data).eq('id', editing.id);
        if (error) throw error;
        return { ...editing, ...data };
      } else {
        const { data: created, error } = await supabase.from('external_provider').insert([data]).select().single();
        if (error) throw error;
        return created;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['externalProviders'] });
      close();
    },
    onError: (err) => alert(`Помилка: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('external_provider').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['externalProviders'] }),
    onError: (err) => alert(`Помилка видалення: ${err.message}`),
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (p, e) => { e.stopPropagation(); setEditing(p); setForm(p); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); setForm(emptyForm); };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (confirm('Ви впевнені, що хочете видалити цього стороннього виконавця?')) deleteMutation.mutate(id);
  };

  const getProviderStats = (providerId) => {
    const provOrders = orders.filter(o => o && o.provider_id === providerId);
    const pending = provOrders.filter(o => o.status !== 'Готово' && o.status !== 'Відмінено').length;
    // Розрахунок боргу: сума total_amount для замовлень зі статусом оплати не "Оплачено"
    const debt = provOrders
      .filter(o => {
        const status = (o.payment_status || '').toLowerCase();
        return status !== 'оплачено' && status !== 'сплачено' && status !== 'paid';
      })
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);
    return { total: provOrders.length, pending, debt, all: provOrders };
  };

  // Загальний борг по всіх провайдерах
  const totalDebt = providers.reduce((sum, p) => {
    const stats = getProviderStats(p.id);
    return sum + stats.debt;
  }, 0);

  const exportToExcel = (providerName, providerOrders) => {
    const data = providerOrders.map((o, index) => ({
      '№': index + 1,
      'Номер замовлення': o.order_number || o.id,
      'Пацієнт': o.patient_name || 'Не вказано',
      'Статус': o.status || 'Новий',
      'Дата створення': o.created_at ? new Date(o.created_at).toLocaleDateString('uk-UA') : '-',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Замовлення');
    XLSX.writeFile(wb, `Звіт_${providerName.replace(/\s+/g, '_')}.xlsx`);
  };

  const exportToPDF = (providerName, providerOrders) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Звіт по замовленнях: ${providerName}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Згенеровано: ${new Date().toLocaleDateString('uk-UA')}`, 14, 28);
    let y = 40;
    doc.text('№  Замовлення       Пацієнт               Статус', 14, y);
    doc.line(14, y + 2, 196, y + 2);
    y += 10;
    providerOrders.forEach((o, index) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const num = String(index + 1).padEnd(3);
      const id = String(o.order_number || o.id).substring(0, 15).padEnd(16);
      const name = String(o.patient_name || 'Не вказано').substring(0, 20).padEnd(22);
      const status = String(o.status || 'Новий');
      doc.text(`${num} ${id} ${name} ${status}`, 14, y);
      y += 8;
    });
    doc.save(`Звіт_${providerName.replace(/\s+/g, '_')}.pdf`);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setForm({ ...form, file_url: URL.createObjectURL(file), notes: form.notes || `Прикріплено файл: ${file.name}` });
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Завантаження сторонніх виконавців...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight">Сторонні виконавці</h1>
          <p className="text-sm text-muted-foreground mt-1">Керування зовнішніми лабораторіями та фрезерними центрами</p>
        </div>
        <div className="flex items-center gap-3">
          {totalDebt > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              Загальний борг: {totalDebt.toFixed(2)} ₴
            </Badge>
          )}
          <Button onClick={openAdd} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Додати виконавця
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.length === 0 ? (
          <div className="col-span-2 text-center p-8 bg-muted/20 border border-dashed rounded-lg text-muted-foreground">
            Немає доданих сторонніх виконавців.
          </div>
        ) : (
          providers.map(p => {
            if (!p || !p.id) return null;
            const stats = getProviderStats(p.id);
            return (
              <Card 
                key={p.id} 
                className={`hover:border-primary/40 transition-all ${onSelect ? 'cursor-pointer' : ''}`}
                onClick={() => onSelect && onSelect(p)}
              >
                <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {p.type === 'Лабораторія' ? (
                          <FlaskConical className="w-4 h-4 text-purple-500" />
                        ) : (
                          <User className="w-4 h-4 text-blue-500" />
                        )}
                        <h3 className="font-semibold text-lg leading-tight">{p.name}</h3>
                      </div>
                      <div className="flex gap-1.5 pt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{p.type}</Badge>
                        {stats.pending > 0 && (
                          <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            В роботі: {stats.pending}
                          </Badge>
                        )}
                        {stats.debt > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            Борг: {stats.debt.toFixed(2)} ₴
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1 items-center">
                      {stats.total > 0 && (
                        <>
                          <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-emerald-600" title="Експорт в Excel" onClick={(e) => { e.stopPropagation(); exportToExcel(p.name, stats.all); }}>
                            <FileSpreadsheet className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-red-600" title="Експорт в PDF" onClick={(e) => { e.stopPropagation(); exportToPDF(p.name, stats.all); }}>
                            <FileText className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {p.file_url && (
                        <a href={p.file_url} download={`Прайс_${p.name}`} onClick={e => e.stopPropagation()} title="Завантажити прикріплений прайс/файл">
                          <Button size="icon" variant="ghost" className="w-8 h-8 text-blue-600 hover:text-blue-800">
                            <Download className="w-4 h-4" />
                          </Button>
                        </a>
                      )}
                      <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={(e) => openEdit(p, e)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={(e) => handleDelete(p.id, e)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{p.phone || 'Не вказано'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{p.email || 'Не вказано'}</span>
                    </div>
                  </div>

                  {p.notes && (
                    <div className="text-xs bg-muted/40 p-2 rounded text-muted-foreground italic border-l-2 border-muted">
                      {p.notes}
                    </div>
                  )}

                  {onSelect && (
                    <div className="flex justify-end pt-2 text-xs font-medium text-primary items-center gap-0.5">
                      Обрати виконавця <ChevronRight className="w-3 h-3" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Редагувати виконавця' : 'Додати нового виконавця'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4 pt-2">
            <div>
              <Label>Тип *</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Технік">Технік</SelectItem>
                  <SelectItem value="Лабораторія">Лабораторія</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Назва / ПІБ *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Телефон</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Прикріпити Прайс-лист / Файл договору</Label>
              <Input type="file" onChange={handleFileUpload} className="cursor-pointer pt-1" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg" />
            </div>
            <div>
              <Label>Примітки</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>Скасувати</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Збереження...' : 'Зберегти'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}