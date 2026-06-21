import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

export default function OrderItemsTable({ items, priceItems, discount, onChange }) {
  const addItem = () => {
    onChange([...items, { price_item_id: '', service_name: '', teeth_numbers: '', quantity: 1, unit_price: 0, technician_pay: 0, total: 0 }]);
  };

  const removeItem = (index) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'price_item_id') {
      const pi = priceItems.find(p => p.id === value);
      if (pi) {
        const discountedPrice = pi.client_price * (1 - (discount || 0) / 100);
        updated[index].service_name = pi.name;
        updated[index].unit_price = Math.round(discountedPrice * 100) / 100;
        updated[index].technician_pay = pi.technician_pay || 0;
      }
    }

    if (field === 'quantity' || field === 'unit_price' || field === 'price_item_id') {
      updated[index].total = (updated[index].quantity || 0) * (updated[index].unit_price || 0);
    }

    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Специфікація робіт</h3>
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Додати
        </Button>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6 border rounded-lg border-dashed">
          Додайте послуги до наряду
        </p>
      )}

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Select value={item.price_item_id} onValueChange={v => updateItem(idx, 'price_item_id', v)}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Оберіть послугу" /></SelectTrigger>
                  <SelectContent>
                    {priceItems.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} — {p.client_price} грн</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive shrink-0" onClick={() => removeItem(idx)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Зуби</label>
                <Input
                  placeholder="11-13, 21"
                  value={item.teeth_numbers}
                  onChange={e => updateItem(idx, 'teeth_numbers', e.target.value)}
                  className="bg-background"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Кількість</label>
                <Input
                  type="number" min="1"
                  value={item.quantity}
                  onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                  className="bg-background"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ціна (грн)</label>
                <Input
                  type="number" min="0" step="0.01"
                  value={item.unit_price}
                  onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                  className="bg-background"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Сума (грн)</label>
                <Input value={item.total?.toFixed(2)} disabled className="bg-muted font-semibold" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div className="flex justify-end pt-2 border-t">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Разом:</p>
            <p className="text-xl font-bold text-foreground">
              {items.reduce((s, i) => s + (i.total || 0), 0).toFixed(2)} грн
            </p>
          </div>
        </div>
      )}
    </div>
  );
}