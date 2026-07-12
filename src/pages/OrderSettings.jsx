import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/PageHeader';
import { Save, AlertCircle, Plus, Trash2, Link, Loader2, Palette } from 'lucide-react';

const DEFAULT_TOOTH_TYPES = [
  { label: 'К', title: 'Коронка', color: '#3b82f6' },
  { label: 'КМ', title: 'Коронка металокерамічна', color: '#6366f1' },
  { label: 'КК', title: 'Куксова вкладка', color: '#8b5cf6' },
  { label: 'Вк', title: 'Вінір керамічний', color: '#f59e0b' },
  { label: 'Нк', title: 'Накладка керамічна', color: '#f97316' },
  { label: 'Фн', title: 'Фіксація нарізна', color: '#ef4444' },
  { label: 'Мс', title: 'Місток стоматологічний', color: '#ec4899' },
  { label: 'КВ', title: 'Тимчасова коронка', color: '#06b6d4' },
];

export default function OrderSettings() {
  const qc = useQueryClient();
  const [settings, setSettings] = useState([]);
  const [colorPickerIndex, setColorPickerIndex] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: fetchedPriceItems = [] } = useQuery({
    queryKey: ['priceItems'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_item')
        .select('id, name, client_price, price_currency')
        .order('name', { ascending: true });
      if (error) return [];
      return data || [];
    }
  });

  const priceItems = Array.isArray(fetchedPriceItems) ? fetchedPriceItems : [];

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['orderTemplates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('order_template').select('*');
      if (error) return [];
      return data || [];
    },
  });

  useEffect(() => {
    const dbTemplates = Array.isArray(templates) ? templates : [];

    if (dbTemplates.length > 0) {
      setSettings(dbTemplates.map(t => ({
        id: t.id,
        label: t.color_label,
        title: t.color_title || 'Послуга',
        color: t.color_hex || '#3b82f6',
        linked_service_id: t.linked_service_id ? String(t.linked_service_id).trim() : ''
      })));
    } else {
      setSettings(DEFAULT_TOOTH_TYPES.map(dt => ({
        id: null,
        label: dt.label,
        title: dt.title,
        color: dt.color,
        linked_service_id: ''
      })));
    }
    setHasChanges(false);
  }, [templates]);

  const saveAllMutation = useMutation({
    mutationFn: async (items) => {
      for (const item of items) {
        const fields = {
          color_label: item.label.trim().toUpperCase(),
          color_title: item.title,
          color_hex: item.color,
          linked_service_id: item.linked_service_id && item.linked_service_id !== "" ? String(item.linked_service_id).trim() : null
        };

        if (item.id) {
          await supabase.from('order_template').update(fields).eq('id', item.id);
        } else {
          await supabase.from('order_template').insert([fields]);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orderTemplates'] });
      alert("Налаштування збережено!");
      setHasChanges(false);
    },
    onError: (err) => { alert(`Помилка: ${err.message}`); }
  });

  const handleColorChange = (index, newColor) => {
    const updated = [...settings];
    updated[index].color = newColor;
    setSettings(updated);
    setHasChanges(true);
  };

  const handleCreateCustom = () => {
    setSettings([...settings, { id: null, label: 'НОВ', title: 'Новий тип', color: '#10b981', linked_service_id: '' }]);
    setHasChanges(true);
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <PageHeader title="Конфігуратор іконок зубів" subtitle="Налаштуйте літери, назви та кольори для швидкого вибору" />

      <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border">
        <div><h3 className="text-sm font-medium">Конфігурація</h3><p className="text-xs text-muted-foreground">Змініть букви або кольори кнопок</p></div>
        <Button onClick={handleCreateCustom} size="sm" className="gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> Додати новий тип</Button>
      </div>

      <div className="space-y-3">
        {settings.map((item, index) => {
          const currentPriceItem = priceItems.find(p => String(p.id).trim() === String(item.linked_service_id).trim());
          return (
            <Card key={index} className="bg-white">
              <CardContent className="p-4 flex flex-col md:flex-row items-center gap-4">
                <div className="relative">
                  <button
                    onClick={() => setColorPickerIndex(colorPickerIndex === index ? null : index)}
                    className="w-12 h-12 rounded-full flex items-center justify-center font-black text-white shadow border"
                    style={{ backgroundColor: item.color }}>{item.label}</button>
                  {colorPickerIndex === index && (
                    <div className="absolute top-14 left-0 z-50 p-4 bg-white rounded-xl shadow-2xl border w-64 animate-in fade-in zoom-in-95">
                      <input type="color" value={item.color} onChange={(e) => handleColorChange(index, e.target.value)} className="w-full h-10 mb-3" />
                      <div className="grid grid-cols-6 gap-2">
                        {['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#10b981', '#14b8a6', '#06b6d4', '#4b5563', '#000000'].map(c => (
                          <button key={c} onClick={() => handleColorChange(index, c)} className="w-full pt-[100%] rounded-full border border-black/5" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="w-20 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Код</p>
                  <input type="text" maxLength={3} value={item.label} onChange={e => { const u = [...settings]; u[index].label = e.target.value.toUpperCase(); setSettings(u); setHasChanges(true); }} className="w-full h-9 text-center font-bold border rounded" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Назва роботи</p>
                  <input type="text" value={item.title} onChange={e => { const u = [...settings]; u[index].title = e.target.value; setSettings(u); setHasChanges(true); }} className="w-full h-9 px-3 text-xs border rounded" />
                </div>
                <div className="flex-1 min-w-[220px]">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1 text-blue-600"><Link className="w-3 h-3" /> Послуга з прайсу</p>
                  <Select value={item.linked_service_id || '_none'} onValueChange={v => { const u = [...settings]; u[index].linked_service_id = v === '_none' ? '' : v; setSettings(u); setHasChanges(true); }}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">-- Без прив'язки --</SelectItem>
                      {priceItems.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.client_price} {p.price_currency})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="icon" className="text-red-400" onClick={() => { if(confirm("Видалити?")){ const { id } = item; if (id) supabase.from('order_template').delete().eq('id', id).then(() => qc.invalidateQueries({ queryKey: ['orderTemplates'] })); else { const u = settings.filter((_, i) => i !== index); setSettings(u); setHasChanges(true); }}}}><Trash2 className="w-4 h-4" /></Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="pt-6 flex gap-3">
        <Button disabled={!hasChanges} onClick={() => saveAllMutation.mutate(settings)} className="bg-blue-600 gap-2"><Save className="w-4 h-4" /> Зберегти налаштування</Button>
      </div>
    </div>
  );
}
