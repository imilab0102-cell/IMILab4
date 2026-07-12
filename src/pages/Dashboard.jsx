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

import { fetchExchangeRates } from '@/api/currencyService';

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

  const loadRates = async () => {
    setIsRateLoading(true);
    setRateError(null);
    try {
      const rates = await fetchExchangeRates();
      setExchangeRates({ USD: rates.USD, EUR: rates.EUR });
      localStorage.setItem('exchangeRates', JSON.stringify({ USD: rates.USD, EUR: rates.EUR }));
      if (rates.source === 'Static Fallback') {
        setRateError('Використовуються стандартні курси');
      }
    } catch (err) {
      console.error('Error loading rates:', err);
      setRateError('Помилка завантаження курсів');
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
    <div className="space-y-4 md:space-y-6 pb-4">
      {/* Заголовок + вибір валюти + курси */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-3xl font-bold font-heading tracking-tight">
              Дашборд
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Зуботехнічна лабораторія
            </p>
          </div>
          <button
            onClick={loadRates}
            className="p-2 bg-muted rounded-full hover:bg-muted/80 transition-colors"
            title="Оновити дані"
          >
            <RefreshCw className={`w-4 h-4 ${isRateLoading ? 'animate-spin' : ''} text-primary`} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between bg-card border rounded-lg px-3 py-2 shadow-sm">
            <label htmlFor="currency-select" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Валюта
            </label>
            <select
              id="currency-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-transparent text-sm font-bold focus:outline-none text-primary"
            >
              {Object.entries(CURRENCIES).map(([code, { symbol }]) => (
                <option key={code} value={code}>
                  {code} ({symbol})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-around bg-slate-900 text-white rounded-lg px-3 py-2 shadow-sm">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 uppercase">USD</span>
              <span className="text-sm font-bold">{exchangeRates.USD.toFixed(2)}₴</span>
            </div>
            <div className="w-px h-6 bg-slate-700"></div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 uppercase">EUR</span>
              <span className="text-sm font-bold">{exchangeRates.EUR.toFixed(2)}₴</span>
            </div>
          </div>
        </div>
      </div>

      {/* Основні картки статистики - 2 в ряд на мобільних */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {statCards.map((sc, index) => {
          const Icon = sc.icon;
          // Останню картку на мобільному робимо на всю ширину якщо їх непарна кількість
          const isFullWidth = index === statCards.length - 1 && index % 2 === 0;
          return (
            <Card
              key={sc.label}
              className={`overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${isFullWidth ? 'col-span-2 md:col-span-1' : ''}`}
              onClick={() => handleStatClick(sc.filter)}
            >
              <CardContent className="p-3 md:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] md:text-sm text-muted-foreground font-medium truncate">
                      {sc.label}
                    </p>
                    <p className="text-xl md:text-3xl font-bold mt-0.5 truncate">
                      {sc.value}
                    </p>
                  </div>
                  <div
                    className={`w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-lg flex items-center justify-center ${sc.color}`}
                  >
                    <Icon className="w-4 h-4 md:w-5 md:h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Фінансові підсумки - список на мобільних */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">Фінанси</h2>
        <div className="grid grid-cols-1 gap-3">
          {[
            { label: 'Загальна вартість', sub: 'Всі виконані наряди', data: financeTotals.work, color: 'slate', icon: Wallet },
            { label: 'Сплачено', sub: 'Зарахований дохід', data: financeTotals.paid, color: 'emerald', icon: TrendingUp },
            { label: 'Залишок боргів', sub: 'Дебіторка', data: financeTotals.debt, color: 'rose', icon: AlertTriangle }
          ].map((item) => (
            <Card
              key={item.label}
              className={`border-l-4 shadow-sm active:scale-[0.98] transition-transform ${
                item.color === 'slate' ? 'border-l-slate-800' :
                item.color === 'emerald' ? 'border-l-emerald-500' : 'border-l-rose-500'
              }`}
              onClick={() => handleStatClick(item.color === 'slate' ? 'revenue' : item.color === 'emerald' ? 'paid' : 'costs')}
            >
              <CardContent className="p-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    item.color === 'slate' ? 'bg-slate-100 text-slate-800' :
                    item.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                  }`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className={`text-xs font-bold uppercase ${
                      item.color === 'slate' ? 'text-slate-800' :
                      item.color === 'emerald' ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {item.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                  </div>
                </div>
                {renderCurrencyList(item.data, `text-lg font-black ${
                  item.color === 'slate' ? 'text-slate-900' :
                  item.color === 'emerald' ? 'text-emerald-600' : 'text-rose-600'
                }`)}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Розподіл за статусами та дедлайни */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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