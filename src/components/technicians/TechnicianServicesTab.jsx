import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

const CATEGORIES = [
  'Металокераміка',
  'Безметалова кераміка',
  'Знімне протезування',
  'Ортодонтія',
  'CAD/CAM',
  'Інше',
];

export default function TechnicianServicesTab({ technician }) {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ service_name: '', category: 'Інше', price: '', technician_pay: '', material_costs: '0' });

  // Завантаження послуг цього техніка з таблиці technician_service
  const { data: services = [], isLoading } = useQuery({
    queryKey: ['technician-services', technician.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('technician_service')
        .select('*')
        .eq('technician_id', technician.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Групування за категоріями
  const servicesByCategory = useMemo(() => {
    const grouped = {};
    services.forEach(service => {
      const cat = service.category || 'Інше';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(service);
    });
    return grouped;
  }, [services]);

  // Додавання
  const addMutation = useMutation({
    mutationFn: async (newService) => {
      const { data, error } = await supabase
        .from('technician_service')
        .insert([{
          technician_id: technician.id,
          service_name: newService.service_name,
          category: newService.category,
          price: parseFloat(newService.price),
          technician_pay: parseFloat(newService.technician_pay || newService.price),
          material_costs: parseFloat(newService.material_costs) || 0,
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['technician-services', technician.id] });
      setShowDialog(false);
      setEditingId(null);
      setFormData({ service_name: '', category: 'Інше', price: '', technician_pay: '', material_costs: '0' });
    },
    onError: (err) => alert(`Помилка додавання: ${err.message}`),
  });

  // Оновлення
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }) => {
      const { data, error } = await supabase
        .from('technician_service')
        .update({
          service_name: updates.service_name,
          category: updates.category,
          price: parseFloat(updates.price),
          technician_pay: parseFloat(updates.technician_pay || updates.price),
          material_costs: parseFloat(updates.material_costs) || 0,
        })
        .eq('id', id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['technician-services', technician.id] });
      setShowDialog(false);
      setEditingId(null);
      setFormData({ service_name: '', category: 'Інше', price: '', technician_pay: '', material_costs: '0' });
    },
    onError: (err) => alert(`Помилка оновлення: ${err.message}`),
  });

  // Видалення
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('technician_service').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['technician-services', technician.id] });
    },
    onError: (err) => alert(`Помилка видалення: ${err.message}`),
  });

  const openAdd = () => {
    setEditingId(null);
    setFormData({ service_name: '', category: 'Інше', price: '', technician_pay: '', material_costs: '0' });
    setShowDialog(true);
  };

  const openEdit = (service) => {
    setEditingId(service.id);
    setFormData({
      service_name: service.service_name,
      category: service.category || 'Інше',
      price: (service.price ?? '').toString(),
      technician_pay: (service.technician_pay ?? service.price ?? '').toString(),
      material_costs: (service.material_costs ?? 0).toString(),
    });
    setShowDialog(true);
  };

  const saveService = () => {
    if (!formData.service_name || !formData.price) {
      alert('Заповніть назву послуги та ціну');
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...formData });
    } else {
      addMutation.mutate(formData);
    }
  };

  const removeService = (id) => {
    if (confirm('Видалити цю послугу?')) deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Мої послуги</h2>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="w-4 h-4" />
          Додати послугу
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>Послуги ще не додані</p>
          <p className="text-sm mt-1">Додай свої послуги, щоб їх можна було вибирати в нарядах</p>
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map(category => {
            const catServices = servicesByCategory[category];
            if (!catServices || catServices.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="font-semibold text-sm text-muted-foreground mb-3 px-1">{category}</h3>
                <div className="space-y-2">
                  {catServices.map(service => (
                    <Card key={service.id}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold">{service.service_name}</h4>
                          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                            <span>Ціна: <strong className="text-foreground">{service.price ?? '—'} ₴</strong></span>
                            <span>Твоя оплата: <strong className="text-foreground">{service.technician_pay ?? service.price ?? '—'} ₴</strong></span>
                            <span>Матеріали: <strong className="text-foreground">{service.material_costs ?? 0} ₴</strong></span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(service)} disabled={updateMutation.isPending}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => removeService(service.id)} disabled={deleteMutation.isPending}>
                            {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Редагувати послугу' : 'Додати нову послугу'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveService(); }} className="space-y-4">
            <div>
              <Label>Категорія</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Назва послуги *</Label>
              <Input value={formData.service_name} onChange={e => setFormData({ ...formData, service_name: e.target.value })} placeholder="Наприклад, Присовка нейлону" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ціна послуги (₴) *</Label>
                <Input type="number" step="0.01" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} placeholder="250.00" required />
              </div>
              <div>
                <Label>Твоя оплата (₴)</Label>
                <Input type="number" step="0.01" value={formData.technician_pay} onChange={e => setFormData({ ...formData, technician_pay: e.target.value })} placeholder="250.00" />
              </div>
            </div>
            <div>
              <Label>Матеріали / Собівартість (₴)</Label>
              <Input type="number" step="0.01" value={formData.material_costs} onChange={e => setFormData({ ...formData, material_costs: e.target.value })} placeholder="0.00" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Скасувати</Button>
              <Button type="submit" disabled={addMutation.isPending || updateMutation.isPending}>
                {(addMutation.isPending || updateMutation.isPending) ? 'Збереження...' : 'Зберегти'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}