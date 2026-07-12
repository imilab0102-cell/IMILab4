import { Card, CardContent } from '@/components/ui/card';
import StatusBadge from '@/components/StatusBadge';
import { Calendar, UserRound, Building2, Wrench } from 'lucide-react';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

export default function OrderCard({ order, onClick }) {
  // Функція для розрахунку та красивого рендеру роздільних валют стовпчиком
  const renderCurrencies = () => {
    let items = [];
    try {
      if (order?.items) {
        items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
      }
    } catch (e) {
      console.error("Помилка парсингу items в OrderCard:", e);
    }

    if (!Array.isArray(items) || items.length === 0) {
      const fallbackAmount = parseFloat(order?.total_amount) || 0;
      if (fallbackAmount <= 0) return null;
      return (
        <div className="mt-2 pt-2 border-t text-right">
          <span className="text-sm font-bold text-gray-950">{fallbackAmount.toFixed(0)} грн</span>
        </div>
      );
    }

    // Рахуємо суми для кожної валюти окремо
    const totals = { UAH: 0, USD: 0, EUR: 0 };
    items.forEach(item => {
      const currency = item?.price_currency || 'UAH';
      const itemTotal = parseFloat(item?.total) || 0;
      if (totals[currency] !== undefined) {
        totals[currency] += itemTotal;
      }
    });

    // Враховуємо загальну знижку наряду або знижку лікаря
    const activeDiscount = parseFloat(order?.discount) || parseFloat(order?.doctor_discount) || 0;
    if (activeDiscount > 0) {
      Object.keys(totals).forEach(curr => {
        totals[curr] = totals[curr] * (1 - activeDiscount / 100);
      });
    }

    // Формуємо масив рядків для кожної активної валюти
    const lines = [];
    if (totals.UAH > 0) {
      lines.push(
        <div key="uah" className="text-sm font-bold text-gray-950 leading-tight">
          {totals.UAH.toFixed(0)} грн
        </div>
      );
    }
    if (totals.USD > 0) {
      lines.push(
        <div key="usd" className="text-sm font-bold text-emerald-600 leading-tight">
          ${totals.USD.toFixed(0)}
        </div>
      );
    }
    if (totals.EUR > 0) {
      lines.push(
        <div key="eur" className="text-sm font-bold text-blue-600 leading-tight">
          €{totals.EUR.toFixed(0)}
        </div>
      );
    }

    if (lines.length === 0) {
      const fallbackAmount = parseFloat(order?.total_amount) || 0;
      if (fallbackAmount <= 0) return null;
      return (
        <div className="mt-2 pt-2 border-t text-right">
          <span className="text-sm font-bold text-gray-950">{fallbackAmount.toFixed(0)} грн</span>
        </div>
      );
    }

    return (
      <div className="mt-2 pt-2 border-t flex flex-col items-end text-right space-y-0.5">
        {lines}
      </div>
    );
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 active:scale-[0.99]"
      onClick={() => onClick(order)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-mono text-muted-foreground">{order.order_number}</span>
          <StatusBadge status={order.status} />
        </div>
        
        <h3 className="font-semibold text-sm mb-2 truncate">{order.patient_name}</h3>
        
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3 h-3" />
            <span className="truncate">{order.clinic_name || '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <UserRound className="w-3 h-3" />
            <span className="truncate">{order.doctor_name || '—'}</span>
          </div>
          {order.technician_name && (
            <div className="flex items-center gap-1.5">
              <Wrench className="w-3 h-3" />
              <span className="truncate">{order.technician_name}</span>
            </div>
          )}
          {order.due_date && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              <span>{format(new Date(order.due_date), 'd MMM', { locale: uk })}</span>
            </div>
          )}
        </div>

        {renderCurrencies()}
      </CardContent>
    </Card>
  );
}