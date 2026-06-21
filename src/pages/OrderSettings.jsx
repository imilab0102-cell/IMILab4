import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/PageHeader';
import { Save, AlertCircle, Plus, Trash2, Link, Loader2 } from 'lucide-react';

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
      const { data, error } = await supabase
        .from('order_template')
        .select('*');
      if (error) {
        console.error("Помилка завантаження order_template:", error);
        return [];
      }
      return data || [];
    },
  });

  useEffect(() => {
    const safeTemplates = Array.isArray(templates) ? templates : [];
    const cleanTemplatesMap = {};
    safeTemplates.forEach(t => {
      if (t && t.color_label) {
        const cleanLabel = t.color_label.trim().toUpperCase();
        if (!cleanTemplatesMap[cleanLabel] || t.linked_service_id) {
          cleanTemplatesMap[cleanLabel] = t;
        }
      }
    });

    const merged = DEFAULT_TOOTH_TYPES.map(dt => {
      const found = cleanTemplatesMap[dt.label.toUpperCase()];
      return {
        id: found?.id || null,
        label: dt.label,
        title: found?.color_title || dt.title,
        color: found?.color_hex || dt.color,
        linked_service_id: found?.linked_service_id ? String(found.linked_service_id).trim() : ''
      };
    });

    const customTemplates = Object.values(cleanTemplatesMap)
      .filter(t => !DEFAULT_TOOTH_TYPES.some(dt => dt.label.toUpperCase() === t.color_label.trim().toUpperCase()))
      .map(t => ({
        id: t.id,
        label: t.color_label,
        title: t.color_title || 'Кастомний тип',
        color: t.color_hex || '#3b82f6',
        linked_service_id: t.linked_service_id ? String(t.linked_service_id).trim() : ''
      }));

    setSettings([...merged, ...customTemplates]);
    setHasChanges(false);
  }, [JSON.stringify(templates)]);

  const saveAllMutation = useMutation({
    mutationFn: async (items) => {
      const updatedItems = [...items];
      for (let i = 0; i < updatedItems.length; i++) {
        const item = updatedItems[i];
        const fields = {
          color_label: item.label.trim().toUpperCase(),
          color_title: item.title,
          color_hex: item.color,
          linked_service_id: item.linked_service_id && item.linked_service_id !== "" ? String(item.linked_service_id).trim() : null
        };

        if (item.id) {
          const { error } = await supabase
            .from('order_template')
            .update(fields)
            .eq('id', item.id);
          if (error) throw new Error(`Помилка оновлення: ${error.message}`);
        } else {
          const { data, error } = await supabase
            .from('order_template')
            .insert([fields])
            .select();
          if (error) throw new Error(`Помилка створення запису: ${error.message}`);
          if (data && data[0]) {
            updatedItems[i].id = data[0].id;
          }
        }
      }
      return updatedItems;
    },
    onSuccess: (updatedItems) => {
      setSettings(updatedItems);
      qc.invalidateQueries({ queryKey: ['orderTemplates'] });
      alert("Налаштування збережено!");
      setHasChanges(false);
    },
    onError: (err) => {
      alert(`Помилка Supabase: ${err.message}`);
    }
  });

  const handleServiceChange = (index, rawValue) => {
    const updated = [...settings];
    const cleanServiceId = rawValue === "_none" ? "" : String(rawValue).trim();
    updated[index].linked_service_id = cleanServiceId;
    setSettings(updated);
    setHasChanges(true);
  };

  const handleColorChange = (index, newColor) => {
    const updated = [...settings];
    updated[index].color = newColor;
    setSettings(updated);
    setHasChanges(true);
  };

  const handleCreateCustom = () => {
    const label = prompt("Введіть короткий код для нового типу роботи (наприклад: БМ, ВІН):");
    if (!label || label.trim() === "") return;
    const uppercaseLabel = label.trim().toUpperCase();
    if (settings.some(s => s.label.toUpperCase() === uppercaseLabel)) {
      alert("Такий код уже існує!");
      return;
    }
    setSettings([...settings, {
      id: null,
      label: uppercaseLabel,
      title: 'Кастомний тип',
      color: '#10b981',
      linked_service_id: ''
    }]);
    setHasChanges(true);
  };

  const handleDeleteOrReset = async (index, item) => {
    if (!item.id) {
      const updated = [...settings];
      updated[index].linked_service_id = '';
      setSettings(updated);
      setHasChanges(true);
      return;
    }
    const isDefaultType = DEFAULT_TOOTH_TYPES.some(d => d.label.toUpperCase() === item.label.toUpperCase());
    const msg = isDefaultType
      ? `Скинути прив'язку ціни для стандартного коду "${item.label}"?`
      : `Ви дійсно хочете видалити кастомний код "${item.label}"?`;
    if (confirm(msg)) {
      try {
        const { error } = await supabase
          .from('order_template')
          .delete()
          .eq('id', item.id);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ['orderTemplates'] });
      } catch (err) {
        alert("Помилка видалення з Supabase: " + err.message);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <PageHeader
        title="Конфігуратор іконок зубів"
        subtitle="Зв'яжіть літери швидкого вибору з позиціями вашого прайс-листа"
      />
      <div className="flex justify-between items-center bg-muted/50 p-4 rounded-xl border border-gray-200 bg-gray-50/50">
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium">Конфігурація зв'язків</h3>
          <p className="text-xs text-muted-foreground">Налаштування зберігаються безпосередньо в Postgres.</p>
        </div>
        <Button onClick={handleCreateCustom} size="sm" className="gap-1.5 text-xs h-8">
          <Plus className="w-3.5 h-3.5" /> Створити новий код
        </Button>
      </div>

      <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
        {settings.map((item, index) => {
          const currentPriceItem = priceItems.find(p => p && p.id && item.linked_service_id && p.id.toString().trim() === item.linked_service_id.toString().trim());
          const selectValue = item.linked_service_id ? String(item.linked_service_id).trim() : "_none";
          return (
            <Card key={item.id || `type-card-${item.label}-${index}`} className="shadow-none border-gray-200 hover:border-gray-300 transition-all bg-white">
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                <div className="relative flex-shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setColorPickerIndex(colorPickerIndex === index ? null : index)}
                    className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white shadow border border-black/10 text-sm"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.label}
                  </button>
                  {colorPickerIndex === index && (
                    <div className="absolute top-14 left-0 z-50 p-3 bg-white rounded-lg shadow-xl border">
                      <input
                        type="color"
                        value={item.color}
                        onChange={(e) => handleColorChange(index, e.target.value)}
                        className="w-16 h-16 cursor-pointer"
                      />
                    </div>
                  )}
                  <div className="w-16">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1 text-center">Код</label>
                    <div className="h-9 flex items-center justify-center font-bold text-gray-800 bg-gray-100 rounded border text-sm uppercase">
                      {item.label}
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-[220px]">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">
                    <span className="flex items-center gap-1 text-blue-600">
                      <Link className="w-3 h-3" /> Прив'язана послуга з прайс-листа
                    </span>
                  </label>
                  <Select value={selectValue} onValueChange={(val) => handleServiceChange(index, val)}>
                    <SelectTrigger className="h-9 text-xs font-medium border-gray-300">
                      <SelectValue placeholder="Оберіть послугу для автоматичного прорахунку..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">-- Без прив'язки (ціна буде нульовою) --</SelectItem>
                      {priceItems.map(p => p && p.id && (
                        <SelectItem key={p.id} value={String(p.id).trim()}>
                          {p.name} ({p.client_price} {p.price_currency || 'UAH'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[140px] text-center">
                  <span className="text-[10px] font-bold text-muted-foreground block mb-1 uppercase">Ціна послуги</span>
                  <div className="h-9 flex items-center justify-center bg-gray-50 border border-gray-200 rounded font-mono font-bold text-sm text-emerald-600 px-3">
                    {currentPriceItem ? `${currentPriceItem.client_price} ${currentPriceItem.price_currency || 'UAH'}` : '—'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteOrReset(index, item)}
                  className="text-muted-foreground hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors md:self-end md:mb-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="pt-2 flex items-center gap-3">
        <Button onClick={() => saveAllMutation.mutate(settings)} disabled={saveAllMutation.isPending || !hasChanges} size="lg" className="gap-2 px-6 shadow">
          {saveAllMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Збереження...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Зберегти зміни
            </>
          )}
        </Button>
        {hasChanges && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5" />
            Є незбережені зміни.
          </div>
        )}
      </div>
    </div>
  );
}