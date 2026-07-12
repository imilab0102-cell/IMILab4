import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient'; // Переведено на ваш Supabase клієнт
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch'; // Додано перемикач активності відповідно до БД
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import TechnicianSalaryCard from '@/components/technicians/TechnicianSalaryCard';

const SPECIALIZATIONS = ['Кераміст', 'Знімник', 'Ортодонт', 'CAD/CAM', 'Універсал'];

const emptyForm = { full_name: '', specialization: '', phone: '', is_active: true };

export default function Technicians() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const qc = useQueryClient();

  // 1. Захищений запит техніків безпосередньо з Supabase (таблиця 'technician')
  const { data: rawTechnicians, isLoading } = useQuery({
    queryKey: ['technicians'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('technician')
          .select('*')
          .order('full_name', { ascending: true });

        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error("Помилка завантаження техніків з Supabase:", err);
        return [];
      }
    },
  });

  const technicians = Array.isArray(rawTechnicians) ? rawTechnicians : [];

  // 2. Мутація створення або оновлення запису (надсилає ТІЛЬКИ ті поля, що є в SQL схемі)
  const saveMutation = useMutation({
    mutationFn: async (formData) => {
      const payload = {
        full_name: formData.full_name,
        specialization: formData.specialization || null,
        phone: formData.phone || null,
        is_active: formData.is_active ?? true
      };

      if (editing?.id) {
        const { data, error } = await supabase
          .from('technician')
          .update(payload)
          .eq('id', editing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('technician')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      // Оновлюємо і список техніків, і випадаючий список у формі створення нарядів
      qc.invalidateQueries({ queryKey: ['technicians'] });
      qc.invalidateQueries({ queryKey: ['technicians-form-list'] });
      closeDialog();
    },
    onError: (error) => {
      console.error("Помилка при збереженні техніка:", error);
      alert(`Не вдалося зберегти: ${error.message}`);
    }
  });

  // 3. Мутація видалення техніка через Supabase
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('technician')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['technicians'] });
      qc.invalidateQueries({ queryKey: ['technicians-form-list'] });
    },
    onError: (error) => {
      console.error("Помилка видалення:", error);
      alert(`Помилка видалення: ${error.message}`);
    }
  });

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      full_name: t.full_name,
      specialization: t.specialization || '',
      phone: t.phone || '',
      is_active: t.is_active ?? true
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader 
        title="Техніки" 
        subtitle={`${technicians.length} техніків у базі`} 
        onAdd={() => { setEditing(null); setForm(emptyForm); setOpen(true); }} 
        addLabel="Додати техніка" 
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {technicians.map(t => t && (
            <TechnicianSalaryCard 
              key={t.id} 
              technician={t}
              onEdit={openEdit}
              onDelete={(id) => {
                if (window.confirm(`Ви дійсно бажаєте видалити техніка ${t.full_name}?`)) {
                  deleteMutation.mutate(id);
                }
              }}
            />
          ))}
          {technicians.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-12">
              Техніків не знайдено. Натисніть "Додати техніка", щоб створити картку.
            </p>
          )}
        </div>
      )}

      {/* Модальне вікно створення/редагування техніка */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle>{editing ? 'Редагувати дані техніка' : 'Реєстрація нового техніка'}</DialogTitle>
            <DialogDescription className="sr-only">
              Форма для додавання або оновлення інформації про техніка в таблиці public.technician.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>ПІБ *</Label>
              <Input 
                value={form.full_name} 
                onChange={e => setForm({ ...form, full_name: e.target.value })} 
                placeholder="Іванов Олег" 
                required 
              />
            </div>

            <div className="space-y-1.5">
              <Label>Спеціалізація</Label>
              <Select value={form.specialization} onValueChange={v => setForm({ ...form, specialization: v })}>
                <SelectTrigger><SelectValue placeholder="Оберіть спеціалізацію" /></SelectTrigger>
                <SelectContent>
                  {SPECIALIZATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <Input 
                value={form.phone} 
                onChange={e => setForm({ ...form, phone: e.target.value })} 
                placeholder="+380..." 
              />
            </div>

            {/* Блок активації/деактивації техніка відповідно до булевого поля is_active у схемі */}
            <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md border">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-gray-900">Доступність для нарядів</Label>
                <p className="text-xs text-muted-foreground">Якщо вимкнено, технік не відображатиметься у списку вибору для нових замовлень</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={checked => setForm({ ...form, is_active: checked })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={closeDialog}>Скасувати</Button>
              <Button type="submit" disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {saveMutation.isPending ? 'Збереження...' : 'Зберегти'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}