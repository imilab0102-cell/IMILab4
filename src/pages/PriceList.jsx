import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient'; // Импорт вашего налаштованого клієнта Supabase
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

const DEFAULT_CATEGORIES = ['Металокераміка', 'Безметалова кераміка', 'Знімне протезування', 'Ортодонтія', 'CAD/CAM', 'Інше'];

const loadCategories = () => {
  try {
    const saved = localStorage.getItem('priceListCategories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  } catch { return DEFAULT_CATEGORIES; }
};

const saveCategories = (cats) => {
  try {
    localStorage.setItem('priceListCategories', JSON.stringify(cats));
  } catch (err) {
    console.error("Не вдалося зберегти категорії в localStorage", err);
  }
};

export default function PriceList() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', category: '', price_currency: 'UAH', client_price: '' });
  const [categories, setCategories] = useState(loadCategories);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const qc = useQueryClient();

  // Завантаження послуг із Supabase
  const { data: rawItems, isLoading } = useQuery({
    queryKey: ['priceItems'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_item')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error("Помилка при завантаженні прайс-листа:", error);
        throw error;
      }
      return data || [];
    },
  });

  // Гарантуємо, що items завжди є масивом
  const items = Array.isArray(rawItems) ? rawItems : [];

  // Мутація для створення або оновлення запису в Supabase
  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const clean = {
        name: data.name,
        category: data.category || null,
        client_price: parseFloat(data.client_price) || 0,
        price_currency: data.price_currency || 'UAH', // Передаємо обрану валюту
      };

      if (editing?.id) {
        const { data: updatedData, error } = await supabase
          .from('price_item')
          .update(clean)
          .eq('id', editing.id)
          .select()
          .single();

        if (error) throw error;
        return updatedData;
      } else {
        const { data: insertedData, error } = await supabase
          .from('price_item')
          .insert([clean])
          .select()
          .single();

        if (error) throw error;
        return insertedData;
      }
    },
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['priceItems'] }); 
      closeDialog(); 
    },
    onError: (error) => {
      console.error("Помилка збереження:", error);
      alert(`Не вдалося зберегти послугу: ${error.message}`);
    }
  });

  // Мутація для видалення запису із Supabase
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('price_item')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['priceItems'] }),
    onError: (error) => {
      console.error("Помилка видалення:", error);
      alert(`Не вдалося видалити послугу: ${error.message}`);
    }
  });

  const closeDialog = () => { 
    setOpen(false); 
    setEditing(null); 
    setForm({ name: '', category: '', price_currency: 'UAH', client_price: '' }); 
    setShowNewCategory(false);
    setNewCategoryInput('');
  };

  const openEdit = (item) => {
    if (!item) return;
    setEditing(item);
    setForm({ 
      name: item.name || '', 
      category: item.category || '', 
      price_currency: item.price_currency || 'UAH',
      client_price: item.client_price != null ? item.client_price.toString() : ''
    });
    setOpen(true);
  };

  const formatPrice = (price, currency) => {
    if (price == null) return '—';
    const symbols = { UAH: '₴', USD: '$', EUR: '€' };
    const sym = symbols[currency] || symbols['UAH'];
    return `${sym} ${Number(price).toFixed(2)}`;
  };

  const addCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    const updated = [...categories, trimmed];
    setCategories(updated);
    saveCategories(updated);
    setForm({ ...form, category: trimmed });
    setNewCategoryInput('');
    setShowNewCategory(false);
  };

  const allCategories = useMemo(() => {
    const fromItems = items.map(i => i && i.category).filter(Boolean);
    return [...new Set([...categories, ...fromItems])];
  }, [categories, items]);

  const itemsByCategory = useMemo(() => {
    const map = {};
    allCategories.forEach(c => { map[c] = []; });
    items.forEach(item => {
      if (!item) return;
      const cat = item.category || 'Інше';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    });
    return map;
  }, [items, allCategories]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Прайс-лист" subtitle={`${items.length} послуг`} onAdd={() => setOpen(true)} addLabel="Додати послугу" />

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">Прайс-лист порожній</div>
        ) : (
          allCategories.filter(cat => itemsByCategory[cat]?.length > 0).map(cat => (
            <div key={cat} className="rounded-xl border bg-card overflow-hidden shadow-sm bg-white">
              <div className="px-4 py-3 bg-muted/50 border-b flex items-center gap-2">
                <Badge variant="secondary" className="text-sm font-semibold">{cat}</Badge>
                <span className="text-xs text-muted-foreground">{itemsByCategory[cat].length} послуг</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead>Послуга</TableHead>
                      <TableHead className="text-right w-52">Ціна для клініки</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsByCategory[cat].map(item => item && (
                      <TableRow key={item.id} className="group hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium p-3">{item.name}</TableCell>
                        <TableCell className="text-right font-semibold p-3">
                          {formatPrice(item.client_price, item.price_currency)}
                          {item.price_currency && item.price_currency !== 'UAH' && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.price_currency}</span>
                          )}
                        </TableCell>
                        <TableCell className="p-3 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { if(confirm('Видалити послугу з прайсу?')) deleteMutation.mutate(item.id) }}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Редагувати послугу' : 'Нова послуга'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!form.category) return; saveMutation.mutate(form); }} className="space-y-4">
            <div className="space-y-1">
              <Label>Назва послуги *</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Напр. Коронка з діоксиду цирконію" required />
            </div>
            
            <div className="space-y-1">
              <Label>Категорія *</Label>
              <div className="flex flex-col gap-2">
                <Select value={form.category} onValueChange={v => { if (v === '__new__') { setShowNewCategory(true); } else { setForm({...form, category: v}); setShowNewCategory(false); } }}>
                  <SelectTrigger className={!form.category ? 'border-destructive' : ''}><SelectValue placeholder="Оберіть категорію" /></SelectTrigger>
                  <SelectContent>
                    {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectItem value="__new__" className="text-primary font-medium">+ Нова категорія...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {showNewCategory && (
                <div className="flex gap-2 mt-2">
                  <Input
                    value={newCategoryInput}
                    onChange={e => setNewCategoryInput(e.target.value)}
                    placeholder="Назва нової категорії"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                    autoFocus
                  />
                  <Button type="button" size="sm" onClick={addCategory} disabled={!newCategoryInput.trim()}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {!form.category && <p className="text-xs text-destructive mt-1">Оберіть категорію</p>}
            </div>

            {/* ВИБІР ВАЛЮТИ (UAH, USD, EUR) */}
            <div className="space-y-1">
              <Label>Валюта ціни *</Label>
              <div className="flex gap-1 mt-1">
                {['UAH', 'USD', 'EUR'].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({...form, price_currency: c})}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      form.price_currency === c
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-input hover:bg-muted'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Ціна клініки ({form.price_currency}) *</Label>
              <Input type="number" min="0" step="0.01" value={form.client_price} onChange={e => setForm({...form, client_price: e.target.value})} placeholder="0.00" required />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={closeDialog}>Скасувати</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Збереження...' : 'Зберегти'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}