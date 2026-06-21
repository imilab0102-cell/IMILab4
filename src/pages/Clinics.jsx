import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from "../api/supabaseClient";
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Building2, Phone, MapPin, FileText } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

// Оновлено відповідно до колонок у вашій SQL-схемі (без email та website)
const emptyForm = { name: '', phone: '', address: '', notes: '' };

export default function Clinics() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin'; // Або ваша логіка перевірки адміна
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const qc = useQueryClient();

  // 1. Завантаження списку клінік із КОРЕКТНОЇ таблиці 'clinic' (маленькими літерами)
  const { data: rawClinics, isLoading } = useQuery({
    queryKey: ['clinics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic') // Виправлено з 'Clinics' на 'clinic'
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error("Помилка Supabase при завантаженні клінік:", error);
        throw error;
      }
      return data || [];
    }
  });

  const clinics = Array.isArray(rawClinics) ? rawClinics : [];

  // 2. Мутація для створення або редагування клініки
  const saveMutation = useMutation({
    mutationFn: async (formData) => {
      // Передаємо ТІЛЬКИ ті поля, які є у вашій базі даних в таблиці public.clinic
      const payload = {
        name: formData.name,
        phone: formData.phone || null,
        address: formData.address || null,
        notes: formData.notes || null
      };

      if (editing?.id) {
        // Оновлення існуючої клініки
        const { data, error } = await supabase
          .from('clinic') // Виправлено на 'clinic'
          .update(payload)
          .eq('id', editing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Створення нової клініки
        const { data, error } = await supabase
          .from('clinic') // Виправлено на 'clinic'
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      // Інвалідуємо всі пов'язані з клініками запити, щоб оновилися списки всюди (і в формах нарядів теж!)
      qc.invalidateQueries({ queryKey: ['clinics'] });
      qc.invalidateQueries({ queryKey: ['clinics-form-list'] });
      qc.invalidateQueries({ queryKey: ['clinics-page-select'] });
      closeDialog();
    },
    onError: (error) => {
      console.error("Помилка при збереженні клініки:", error);
      alert(`Не вдалося зберегти клініку: ${error.message}`);
    }
  });

  // 3. Мутація для видалення клініки
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('clinic') // Виправлено на 'clinic'
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinics'] });
      qc.invalidateQueries({ queryKey: ['clinics-form-list'] });
      qc.invalidateQueries({ queryKey: ['clinics-page-select'] });
    },
    onError: (error) => {
      console.error("Помилка при видаленні клініки:", error);
      alert(`Не вдалося видалити клініку: ${error.message}`);
    }
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (clinic) => {
    setEditing(clinic);
    setForm({
      name: clinic.name || '',
      phone: clinic.phone || '',
      address: clinic.address || '',
      notes: clinic.notes || ''
    });
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("Назва клініки обов'язкова!");
      return;
    }
    saveMutation.mutate(form);
  };

  const handleDelete = (clinic) => {
    if (window.confirm(`Ви впевнені, що хочете видалити клініку "${clinic.name}"?`)) {
      deleteMutation.mutate(clinic.id);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Медичні клініки</h1>
          <p className="text-sm text-muted-foreground">
            Всього зареєстровано: {clinics.length} клінік
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
          <Plus className="w-4 h-4" /> Додати клініку
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clinics.map((clinic) => (
            <Card key={clinic.id} className="overflow-hidden hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-md shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 leading-snug text-base line-clamp-2" title={clinic.name}>
                        {clinic.name}
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-muted-foreground border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-gray-600 truncate">{clinic.phone || 'Не вказано'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-gray-600 truncate" title={clinic.address}>
                        {clinic.address || 'Адресу не вказано'}
                      </span>
                    </div>
                    {clinic.notes && (
                      <div className="flex items-start gap-2 bg-gray-50 p-2 rounded text-xs mt-1">
                        <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        <p className="text-gray-600 line-clamp-2">{clinic.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={() => openEdit(clinic)} className="h-8 gap-1 text-xs">
                    <Pencil className="w-3.5 h-3.5" /> Редагувати
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(clinic)}
                    disabled={deleteMutation.isPending}
                    className="h-8 gap-1 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Видалити
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {clinics.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-12">Клінік не знайдено. Додайте першу клініку.</p>
          )}
        </div>
      )}

      {/* Модальне вікно створення/редагування */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Редагувати клініку' : 'Додати нову клініку'}
            </DialogTitle>
            <DialogDescription>
              Заповніть форму. Дані будуть збережені в таблицю public.clinic вашої бази даних.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Назва клініки *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Стоматологія 'Дент-Мастер'"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Контактний телефон</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+380..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Фактична адреса</Label>
              <Input
                id="address"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="м. Київ, вул. Хрещатик, 1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Нотатки / Коментар</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Особливості співпраці, робочі години або реквізити..."
                rows={3}
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