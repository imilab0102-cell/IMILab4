import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { ORDER_STATUSES } from '@/lib/constants';
import { format, isBefore } from 'date-fns';
import { uk } from 'date-fns/locale';
import StatusBadge from '@/components/StatusBadge';

// Доступні валюти
const CURRENCIES = {
  UAH: { symbol: '₴', label: 'Гривня' },
  USD: { symbol: '$', label: 'Долар США' },
  EUR: { symbol: '€', label: 'Євро' },
};

export default function Dashboard() {
  const navigate = useNavigate();

  // Стан для валюти
  const [currency, setCurrency] = useState(() => {
    const saved = localStorage.getItem('dashboardCurrency');
    return saved && CURRENCIES[saved] ? saved : 'UAH';
  });

  useEffect(() => {
    localStorage.setItem('dashboardCurrency', currency);
  }, [currency]);

  // Стан для курсів валют
  const [exchangeRates, setExchangeRates] = useState({ USD: 41.5, EUR: 44.5 });
  const [isRateLoading, setIsRateLoading] = useState(true);
  const [rateError, setRateError] = useState(null);

  // Використовуємо проксі Vite для обходу CORS
  const loadRates = async () => {
    setIsRateLoading(true);
    setRateError(null);
    try {
      // Використовуємо проксі до НБУ через Vite
      const response = await fetch('/api/nbu');
      if (!response.ok) throw new Error('Помилка отримання курсів НБУ');
      const data = await response.json();
      const usd = data.find((r) => r.CurrencyCode === 'USD');
      const eur = data.find((r) => r.CurrencyCode === 'EUR');
      const rates = {
        USD: usd?.Rate || 41.5,
        EUR: eur?.Rate || 44.5,
      };
      setExchangeRates(rates);
      localStorage.setItem('exchangeRates', JSON.stringify(rates));
    } catch (err) {
      console.warn('НБУ недоступний, пробуємо rulya-bank через проксі...', err);
      try {
        const response = await fetch('/api/rulya');
        if (!response.ok) throw new Error('Помилка завантаження rulya-bank');
        const html = await response.text();
        const usdMatch = html.match(/USD\s*\|\|\s*([\d.]+)/i);
        const eurMatch = html.match(/EUR\s*\|\|\s*([\d.]+)/i);
        const rates = {
          USD: usdMatch ? parseFloat(usdMatch[1]) : 41.5,
          EUR: eurMatch ? parseFloat(eurMatch[1]) : 44.5,
        };
        setExchangeRates(rates);
        localStorage.setItem('exchangeRates', JSON.stringify(rates));
      } catch (err2) {
        console.error('Помилка завантаження курсів:', err2);
        setRateError('Не вдалося завантажити актуальні курси. Використовуються збережені.');
        const cached = localStorage.getItem('exchangeRates');
        if (cached) {
          try {
            setExchangeRates(JSON.parse(cached));
          } catch {}
        }
      }
    } finally {
      setIsRateLoading(false);
    }
  };

  useEffect(() => {
    loadRates();
    const interval = setInterval(loadRates, 300000); // 5 хв
    return () => clearInterval(interval);
  }, []);

  // Запити до БД
  const { data: rawOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['workOrders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('WorkOrder')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: rawServiceCosts } = useQuery({
    queryKey: ['serviceCosts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_cost').select('*');
      if (error) return [];
      return data || [];
    },
  });

  const orders = Array.isArray(rawOrders) ? rawOrders : [];
  const serviceCosts = Array.isArray(rawServiceCosts) ? rawServiceCosts : [];

  // Допоміжні функції
  const getStatus = (o) => o?.status || '';

  const checkIfFullyPaid = (order) => {
    if (!order) return false;
    if (order.payment_status) {
      const pStatus = String(order.payment_status).trim().toLowerCase();
      return pStatus === 'оплачено' || pStatus === 'paid' || pStatus === 'сплачено';
    }
    return false;
  };

  // Статистика
  const stats = {
    total: orders.length,
    active: orders.filter((o) => {
      const s = getStatus(o);
      return s === 'В роботі' || s === 'На примірці';
    }).length,
    ready: orders.filter((o) => getStatus(o) === 'Готовий').length,
    overdue: orders.filter((o) => {
      if (!o || !o.due_date) return false;
      const s = getStatus(o);
      if (['Зданий', 'Скасований'].includes(s)) return false;
      try {
        return isBefore(new Date(o.due_date), new Date());
      } catch {
        return false;
      }
    }).length,
    totalRevenue: orders
      .filter((o) => getStatus(o) === 'Зданий')
      .reduce((sum, o) => sum + (o.total_amount || 0), 0),
    totalProfit: serviceCosts.reduce((sum, c) => sum + (c?.net_profit || 0), 0),
    totalCosts: serviceCosts.reduce((sum, c) => sum + (c?.total_cost || 0), 0),
  };

  // Фінансові підсумки з різними валютами
  const financeTotals = useMemo(() => {
    const totals = {
      work: { UAH: 0, USD: 0, EUR: 0 },
      paid: { UAH: 0, USD: 0, EUR: 0 },
      debt: { UAH: 0, USD: 0, EUR: 0 },
    };

    orders.forEach((o) => {
      if (!o) return;
      if (getStatus(o) === 'Скасований') return;

      let items = [];
      try {
        items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
      } catch {
        items = [];
      }

      const isPaid = checkIfFullyPaid(o);
      const discountPercent = parseFloat(o.manual_discount_percent) || parseFloat(o.doctor_discount) || 0;
      const dbPaidAmountGrn = parseFloat(o.paid_amount) || 0;

      if (items.length === 0) {
        const orderTotal = parseFloat(o.total_amount) || 0;
        totals.work.UAH += orderTotal;
        if (isPaid) {
          totals.paid.UAH += orderTotal;
        } else {
          totals.paid.UAH += Math.min(orderTotal, dbPaidAmountGrn);
        }
        return;
      }

      const orderCurrencyTotals = { UAH: 0, USD: 0, EUR: 0 };
      items.forEach((item) => {
        const currency = item?.price_currency || 'UAH';
        if (orderCurrencyTotals[currency] !== undefined) {
          orderCurrencyTotals[currency] += parseFloat(item?.total) || 0;
        }
      });

      ['UAH', 'USD', 'EUR'].forEach((curr) => {
        if (orderCurrencyTotals[curr] > 0 && discountPercent > 0) {
          orderCurrencyTotals[curr] = orderCurrencyTotals[curr] * (1 - discountPercent / 100);
        }
        totals.work[curr] += orderCurrencyTotals[curr];
      });

      if (isPaid) {
        ['UAH', 'USD', 'EUR'].forEach((curr) => {
          totals.paid[curr] += orderCurrencyTotals[curr];
        });
      } else {
        let remainingGrnPaid = dbPaidAmountGrn;
        if (orderCurrencyTotals.UAH > 0) {
          const usedUah = Math.min(orderCurrencyTotals.UAH, remainingGrnPaid);
          totals.paid.UAH += usedUah;
          remainingGrnPaid -= usedUah;
        }
        if (remainingGrnPaid > 0 && orderCurrencyTotals.USD > 0) {
          const usdEquivalentPaid = remainingGrnPaid / exchangeRates.USD;
          const usedUsd = Math.min(orderCurrencyTotals.USD, usdEquivalentPaid);
          totals.paid.USD += usedUsd;
          remainingGrnPaid -= usedUsd * exchangeRates.USD;
        }
        if (remainingGrnPaid > 0 && orderCurrencyTotals.EUR > 0) {
          const eurEquivalentPaid = remainingGrnPaid / exchangeRates.EUR;
          const usedEur = Math.min(orderCurrencyTotals.EUR, eurEquivalentPaid);
          totals.paid.EUR += usedEur;
        }
      }
    });

    ['UAH', 'USD', 'EUR'].forEach((curr) => {
      const diff = totals.work[curr] - totals.paid[curr];
      totals.debt[curr] = diff < 0.01 ? 0 : diff;
    });

    return totals;
  }, [orders, exchangeRates]);

  // Відображення сум у різних валютах
  const renderCurrencyList = (currencyObj, colorClass = '') => {
    const activeValues = Object.entries(currencyObj).filter(([, val]) => val > 0);
    if (activeValues.length === 0) return <span className={colorClass}>0 ₴</span>;
    return (
      <div className="flex flex-col text-right">
        {activeValues.map(([curr, val]) => (
          <span key={curr} className={`font-bold tracking-tight ${colorClass}`}>
            {val.toLocaleString('uk-UA', { maximumFractionDigits: 2 })}{' '}
            {curr === 'UAH' ? '₴' : curr === 'USD' ? '$' : '€'}
          </span>
        ))}
      </div>
    );
  };

  // Найближчі дедлайни
  const upcomingOrders = orders
    .filter(
      (o) =>
        o &&
        !['Зданий', 'Скасований'].includes(getStatus(o)) &&
        o.due_date
    )
    .sort((a, b) => {
      try {
        return new Date(a.due_date) - new Date(b.due_date);
      } catch {
        return 0;
      }
    })
    .slice(0, 8);

  // Обробники кліків
  const handleStatClick = (filterType) => {
    switch (filterType) {
      case 'all':
        navigate('/orders');
        break;
      case 'active':
        navigate('/orders?statuses=В роботі,На примірці');
        break;
      case 'ready':
        navigate('/orders?statuses=Готовий');
        break;
      case 'overdue':
        navigate('/orders?overdue=true');
        break;
      case 'profit':
      case 'revenue':
      case 'costs':
      case 'paid':
        navigate('/reports');
        break;
      default:
        break;
    }
  };

  const handleOrderClick = (orderId) => {
    navigate('/orders', { state: { selectedOrderId: orderId } });
  };

  // Картки статистики
  const statCards = [
    {
      label: 'Всього нарядів',
      value: stats.total,
      icon: FileText,
      color: 'text-primary bg-primary/10',
      filter: 'all',
    },
    {
      label: 'В роботі',
      value: stats.active,
      icon: Clock,
      color: 'text-amber-600 bg-amber-100',
      filter: 'active',
    },
    {
      label: 'Готові до здачі',
      value: stats.ready,
      icon: CheckCircle2,
      color: 'text-emerald-600 bg-emerald-100',
      filter: 'ready',
    },
    {
      label: 'Прострочені',
      value: stats.overdue,
      icon: AlertTriangle,
      color: 'text-red-600 bg-red-100',
      filter: 'overdue',
    },
    {
      label: 'Чистий прибуток',
      value: `${stats.totalProfit.toFixed(0)} ${CURRENCIES[currency].symbol}`,
      icon: TrendingUp,
      color: 'text-emerald-600 bg-emerald-100',
      filter: 'profit',
    },
  ];

  if (ordersLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок + вибір валюти + курси */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight">
            Дашборд
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Огляд зуботехнічної лабораторії
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="currency-select" className="text-sm font-medium">
              Валюта:
            </label>
            <select
              id="currency-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {Object.entries(CURRENCIES).map(([code, { label }]) => (
                <option key={code} value={code}>
                  {code} – {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-md border">
            <RefreshCw className={`w-3.5 h-3.5 ${isRateLoading ? 'animate-spin' : ''} text-slate-500`} />
            <span className="text-xs font-medium">
              USD: {exchangeRates.USD.toFixed(2)}₴
            </span>
            <span className="text-xs font-medium text-slate-400">|</span>
            <span className="text-xs font-medium">
              EUR: {exchangeRates.EUR.toFixed(2)}₴
            </span>
            <button
              onClick={loadRates}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-1"
              title="Оновити курси"
            >
              оновити
            </button>
          </div>
          {rateError && <span className="text-xs text-amber-600">{rateError}</span>}
        </div>
      </div>

      {/* Картки статистики */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((sc) => {
          const Icon = sc.icon;
          return (
            <Card
              key={sc.label}
              className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleStatClick(sc.filter)}
            >
              <CardContent className="p-4 md:p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {sc.label}
                    </p>
                    <p className="text-2xl md:text-3xl font-bold mt-1">
                      {sc.value}
                    </p>
                  </div>
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${sc.color}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Фінансові блоки */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          className="border-l-4 border-l-slate-800 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleStatClick('revenue')}
        >
          <CardContent className="p-5 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Загальна вартість робіт
              </p>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Сума виконаних нарядів
              </span>
            </div>
            {renderCurrencyList(financeTotals.work, 'text-xl font-extrabold text-slate-900')}
          </CardContent>
        </Card>

        <Card
          className="border-l-4 border-l-emerald-500 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleStatClick('paid')}
        >
          <CardContent className="p-5 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                Фактично сплачено
              </p>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Зарахований дохід
              </span>
            </div>
            {renderCurrencyList(financeTotals.paid, 'text-xl font-extrabold text-emerald-600')}
          </CardContent>
        </Card>

        <Card
          className="border-l-4 border-l-rose-500 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleStatClick('costs')}
        >
          <CardContent className="p-5 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">
                Залишок боргів клієнтів
              </p>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Неоплачена дебіторка
              </span>
            </div>
            {renderCurrencyList(financeTotals.debt, 'text-xl font-extrabold text-rose-600')}
          </CardContent>
        </Card>
      </div>

      {/* Додаткові картки: Виручка та Чистий прибуток */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="border-l-4 border-l-amber-500 shadow-sm bg-amber-50/10 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleStatClick('revenue')}
        >
          <CardContent className="p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 rounded-lg text-amber-500">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">
                  Виручка (здані наряди)
                </p>
                <h4 className="text-xl font-extrabold text-amber-600 mt-1">
                  {stats.totalRevenue.toFixed(2)} {CURRENCIES[currency].symbol}
                </h4>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-l-4 border-l-purple-500 shadow-sm bg-purple-50/10 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleStatClick('profit')}
        >
          <CardContent className="p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-50 rounded-lg text-purple-500">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">
                  Чистий прибуток
                </p>
                <h4 className="text-xl font-extrabold text-purple-600 mt-1">
                  {stats.totalProfit.toFixed(2)} {CURRENCIES[currency].symbol}
                </h4>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Розподіл за статусами та дедлайни */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Розподіл за статусами</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ORDER_STATUSES.map((status) => {
              const count = orders.filter((o) => getStatus(o) === status).length;
              const pct = orders.length ? (count / orders.length) * 100 : 0;
              return (
                <div key={status} className="flex items-center gap-3">
                  <StatusBadge status={status} />
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-8 text-right">
                    {count}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Найближчі дедлайни</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Немає активних нарядів
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingOrders.map((o) => {
                  if (!o || !o.due_date) return null;
                  let isOverdue = false;
                  let formattedDate = '';
                  try {
                    isOverdue = isBefore(new Date(o.due_date), new Date());
                    formattedDate = format(new Date(o.due_date), 'd MMM', {
                      locale: uk,
                    });
                  } catch {
                    formattedDate = '—';
                  }
                  return (
                    <button
                      key={o.id}
                      onClick={() => handleOrderClick(o.id)}
                      className="w-full text-left flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {o.patient_name || 'Без імені'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {o.order_number || '—'}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p
                          className={`text-xs font-medium ${
                            isOverdue ? 'text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {formattedDate}
                        </p>
                        <StatusBadge status={o.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}