import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient'; // Перевірте чи правильний шлях у вашому проекті
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Trash2, Edit2, Phone, Building, Percent, FileText } from 'lucide-react';

export default function Doctors() {
  const queryClient = useQueryClient();

  // Локальні стани для пошуку та модалки
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);

  // Стани полів форми (відповідно до вашої SQL схеми)
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [clinicId, setClinicId] = useState('none');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [notes, setNotes] = useState('');

  // === 1. ЗАВАНТАЖЕННЯ ЛІКАРІВ (Таблиця 'doctor') ===
  const { data: rawDoctors, isLoading } = useQuery({
    queryKey: ['doctors-page-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor')
        .select('*')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  // === 2. ЗАВАНТАЖЕННЯ КЛІНІК (Таблиця 'clinic') ===
  const { data: rawClinics } = useQuery({
    queryKey: ['clinics-page-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) return [];
      return data || [];
    }
  });

  const doctors = Array.isArray(rawDoctors) ? rawDoctors : [];
  const clinics = Array.isArray(rawClinics) ? rawClinics : [];

  // === 3. МУТАЦІЯ ДЛЯ СТВОРЕННЯ / РЕДАГУВАННЯ ===
  const saveMutation = useMutation({
    mutationFn: async (doctorData) => {
      // Складаємо об'єкт точно під вашу структуру таблиці public.doctor
      const payload = {
        full_name: doctorData.full_name,
        phone: doctorData.phone || null,
        clinic_id: doctorData.clinic_id === 'none' ? null : doctorData.clinic_id, // передаємо null або валідний UUID клініки
        discount_percent: Number(doctorData.discount_percent) || 0,
        notes: doctorData.notes || null
      };

      if (doctorData.id) {
        // Оновлення (UUID передається у .eq)
        const { data, error } = await supabase
          .from('doctor')
          .update(payload)
          .eq('id', doctorData.id)
          .select();
        if (error) throw error;
        return data[0];
      } else {
        // Створення нового
        const { data, error } = await supabase
          .from('doctor')
          .insert([payload])
          .select();
        if (error) throw error;
        return data[0];
      }
    },
    onSuccess: () => {
      // Оновлюємо кеш, щоб дані одразу змінилися на сторінці та у формах
      queryClient.invalidateQueries({ queryKey: ['doctors-page-list'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      closeModal();
    },
    onError: (err) => {
      alert(`Помилка збереження в базу даних: ${err.message}`);
    }
  });

  // === 4. МУТАЦІЯ ДЛЯ ВИДАЛЕННЯ ===
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('doctor')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctors-page-list'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
    },
    onError: (err) => {
      alert(`Помилка видалення: ${err.message}`);
    }
  });

  const handleCreateNew = () => {
    setEditingDoctor(null);
    setFullName('');
    setPhone('');
    setClinicId('none');
    setDiscountPercent('0');
    setNotes('');
    setIsOpen(true);
  };

  const handleEdit = (doctor) => {
    setEditingDoctor(doctor);
    setFullName(doctor.full_name || '');
    setPhone(doctor.phone || '');
    setClinicId(doctor.clinic_id ? doctor.clinic_id : 'none');
    setDiscountPercent(doctor.discount_percent ? doctor.discount_percent.toString() : '0');
    setNotes(doctor.notes || '');
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setEditingDoctor(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fullName.trim()) return alert("Будь ласка, вкажіть ПІБ лікаря");
    
    saveMutation.mutate({
      id: editingDoctor?.id,
      full_name: fullName,
      phone,
      clinic_id: clinicId,
      discount_percent: discountPercent,
      notes
    });
  };

  // Фільтрація списку на клієнті
  const filteredDoctors = doctors.filter(doc => 
    doc.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    doc.phone?.includes(search)
  );

  const getClinicName = (id) => {
    const clinic = clinics.find(c => c && c.id === id);
    return clinic ? clinic.name : 'Приватна практика';
  };

  return (
    <div className="space-y-6 p-6">
      {/* Заголовок */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Лікарі-стоматологи</h1>
          <p className="text-sm text-muted-foreground">База даних ваших клієнтів (лікарів) та керування їхніми знижками</p>
        </div>
        <Button onClick={handleCreateNew} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm md:w-auto w-full">
          <Plus className="w-4 h-4" /> Додати лікаря
        </Button>
      </div>

      {/* Рядок пошуку */}
      <div className="relative max-w-md bg-card rounded-lg shadow-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Пошук за ПІБ або телефоном..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Таблиця/Сітка карток лікарів */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Завантаження списку лікарів...</div>
      ) : filteredDoctors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDoctors.map((doctor) => (
            <div key={doctor.id} className="bg-white border rounded-lg p-5 shadow-sm space-y-4 flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="text-lg font-semibold text-gray-900 line-clamp-2" title={doctor.full_name}>
                    {doctor.full_name}
                  </h3>
                  {doctor.discount_percent > 0 && (
                    <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-1 rounded shrink-0 flex items-center gap-0.5">
                      <Percent className="w-3 h-3" /> {doctor.discount_percent}%
                    </span>
                  )}
                </div>
                
                <div className="space-y-2 text-sm text-muted-foreground border-t pt-2">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="truncate text-gray-700 font-medium">{getClinicName(doctor.clinic_id)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-gray-600">{doctor.phone || 'Не вказано'}</span>
                  </div>
                  {doctor.notes && (
                    <div className="flex items-start gap-2 bg-gray-50 p-2 rounded text-xs mt-1">
                      <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                      <p className="text-gray-600 line-clamp-2">{doctor.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t pt-3 mt-2">
                <Button variant="outline" size="sm" onClick={() => handleEdit(doctor)} className="h-8 gap-1">
                  <Edit2 className="w-3.5 h-3.5" /> Редагувати
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="h-8 gap-1"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if(confirm(`Ви дійсно хочете видалити лікаря ${doctor.full_name}?`)) {
                      deleteMutation.mutate(doctor.id);
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Видалити
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-12">Лікарів не знайдено</p>
      )}

      {/* Модальне вікно (Діалог форми) */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle>
              {editingDoctor ? 'Редагувати дані лікаря' : 'Додати нового лікаря'}
            </DialogTitle>
            <DialogDescription>
              Введіть дані лікаря. Вони будуть збережені відповідно до схеми таблиці public.doctor.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">ПІБ Лікаря *</label>
              <Input 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Коваленко Андрій Васильович"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Номер телефону</label>
              <Input 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+380..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Медична клініка</label>
              <Select value={clinicId} onValueChange={setClinicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Оберіть клініку" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без прив'язки (приватна практика)</SelectItem>
                  {clinics.map(clinic => clinic && (
                    <SelectItem key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Персональна знижка лікаря (%)</label>
              <Input 
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Нотатки / Коментар</label>
              <Textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Додаткова інформація про лікаря (графік роботи, особливості матеріалів тощо)..."
                rows={3}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={closeModal}>
                Скасувати
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {saveMutation.isPending ? 'Збереження...' : 'Зберегти'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}