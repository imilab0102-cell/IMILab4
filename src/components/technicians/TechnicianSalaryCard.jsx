import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Phone, UserCheck, UserX, Wallet, Wrench, Plus, Loader2 } from 'lucide-react';

// Уніфікований список категорій — має співпадати з TechnicianServicesTab.jsx
const CATEGORIES = [
  'Металокераміка',
  'Безметалова кераміка',
  'Знімне протезування',
  'Ортодонтія',
  'CAD/CAM',
  'Інше',
];

const emptyService = { service_name: '', category: 'Інше', price: '', technician_pay: '', material_costs: '0' };

export default function TechnicianSalaryCard({ technician, onEdit, onDelete }) {
  const navigate = useNavigate();
  if (!technician) return null;

  const qc = useQueryClient();
  const [servicesOpen, setServicesOpen] = useState(false);
  const [newService, setNewService] = useState(emptyService);

  const { data: services = [], isLoading: servicesLoading } = useQuery({
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
    enabled: servicesOpen
  });

  const addServiceMutation = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('technician_service')
        .insert([{
          technician_id: technician.id,
          service_name: payload.service_name,
          category: payload.category || 'Інше',
          price: Number(payload.price) || 0,
          technician_pay: Number(payload.technician_pay || payload.price) || 0,
          material_costs: Number(payload.material_costs) || 0
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['technician-services', technician.id] });
      setNewService(emptyService);
    },
    onError: (error) => alert(`Помилка додавання: ${error.message}`)
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('technician_service').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['technician-services', technician.id] }),
    onError: (error) => alert(`Помилка видалення: ${error.message}`)
  });

  return (
    <Card className={`overflow-hidden border-l-4 transition-all duration-200 ${
      technician.is_active ? 'border-l-green-500' : 'border-l-gray-300 opacity-75'
    }`}>
      <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-md shrink-0 ${
                technician.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {technician.is_active ? <UserCheck className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 leading-tight text-base truncate max-w-[170px]" title={technician.full_name}>
                  {technician.full_name}
                </h3>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  {technician.specialization || 'Універсал'}
                </span>
              </div>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
              technician.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}>
              {technician.is_active ? 'Активний' : 'Пасивний'}
            </span>
          </div>

          <div className="space-y-1.5 text-sm text-muted-foreground border-t pt-3">
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{technician.phone || 'Телефон не вказано'}</span>
            </div>
          </div>

          <Button 
            type="button" 
            variant="outline" 
            className="w-full h-9 text-xs gap-1.5 bg-blue-50/50 text-blue-600 border-blue-100 hover:bg-blue-50"
            onClick={() => setServicesOpen(true)}
          >
            <Wrench className="w-3.5 h-3.5" /> Налаштувати послуги техніка
          </Button>
        </div>

        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/technicians/salary-report', { state: { technicianId: technician.id } })}
            className="h-8 gap-1 text-xs"
          >
            <Wallet className="w-3.5 h-3.5" /> Звіт по зарплаті
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEdit(technician)} className="h-8 gap-1 text-xs">
            <Pencil className="w-3.5 h-3.5" /> Редагувати
          </Button>
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={() => onDelete(technician.id)} 
            className="h-8 gap-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 border-0 shadow-none"
          >
            <Trash2 className="w-3.5 h-3.5" /> Видалити
          </Button>
        </div>
      </CardContent>

      <Dialog open={servicesOpen} onOpenChange={setServicesOpen}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle>Послуги та розцінки: {technician.full_name}</DialogTitle>
          </DialogHeader>

          <form onSubmit={(e) => { e.preventDefault(); addServiceMutation.mutate(newService); }} className="space-y-3 bg-gray-50 p-3 rounded-md border border-gray-200">
            <div className="text-xs font-bold text-gray-700">Додати нову послугу техніка:</div>
            <div className="space-y-2">
              <Input 
                placeholder="Назва (напр. Перебазування на Ілону)" 
                value={newService.service_name}
                onChange={e => setNewService({...newService, service_name: e.target.value})}
                required
                className="h-9 text-sm bg-white"
              />
              <div>
                <Label className="text-[10px] text-gray-500">Категорія</Label>
                <Select value={newService.category} onValueChange={v => setNewService({...newService, category: v})}>
                  <SelectTrigger className="h-9 text-sm bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] text-gray-500">Ціна для клініки (грн)</Label>
                  <Input 
                    type="number" 
                    placeholder="250" 
                    value={newService.price}
                    onChange={e => setNewService({...newService, price: e.target.value})}
                    required
                    className="h-9 text-sm bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-gray-500">Зарплата техніка (грн)</Label>
                  <Input 
                    type="number" 
                    placeholder="200" 
                    value={newService.technician_pay}
                    onChange={e => setNewService({...newService, technician_pay: e.target.value})}
                    className="h-9 text-sm bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-gray-500">Матеріали (грн)</Label>
                  <Input 
                    type="number" 
                    placeholder="0" 
                    value={newService.material_costs}
                    onChange={e => setNewService({...newService, material_costs: e.target.value})}
                    className="h-9 text-sm bg-white"
                  />
                </div>
              </div>
            </div>
            <Button 
              type="submit" 
              disabled={addServiceMutation.isPending} 
              className="w-full h-8 text-xs bg-blue-600 text-white hover:bg-blue-700 gap-1 mt-1"
            >
              {addServiceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {addServiceMutation.isPending ? 'Додавання...' : 'Додати послугу в прайс техніка'}
            </Button>
          </form>

          <div className="space-y-2 max-h-[220px] overflow-y-auto pt-2">
            <div className="text-xs font-bold text-gray-500">Поточний прайс техніка:</div>
            {servicesLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : services.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 bg-white border rounded-sm text-xs">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-gray-800">{s.service_name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{s.category || 'Інше'}</span>
                  </div>
                  <div className="text-[10px] text-gray-400">
                    Ціна: <span className="text-gray-700 font-medium">{s.price ?? '—'} грн</span> | 
                    Зарплата: <span className="text-green-600 font-medium">{s.technician_pay ?? 0} грн</span> | 
                    Матеріали: {s.material_costs ?? 0} грн
                  </div>
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-red-500 hover:text-red-700"
                  onClick={() => { if(confirm('Видалити послугу?')) deleteServiceMutation.mutate(s.id); }}
                  disabled={deleteServiceMutation.isPending}
                >
                  {deleteServiceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            ))}
            {!servicesLoading && services.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-4">Немає доданих персональних послуг.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}