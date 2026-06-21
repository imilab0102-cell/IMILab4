import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient'; // Виправлено підключення до вашої бази Supabase
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, User, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths, parseISO, isToday } from 'date-fns';
import { uk } from 'date-fns/locale';
import { STATUS_COLORS } from '@/lib/constants';
import OrderDetail from '@/components/orders/OrderDetail';
import { useAuth } from '@/lib/AuthContext';

export default function CalendarView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Виправлений запит: Отримуємо наряди безпосередньо з вашої таблиці 'work_orders' або 'WorkOrder' у Supabase
  const { data: rawOrders } = useQuery({
    queryKey: ['workOrdersCalendar'],
    queryFn: async () => {
      // Робимо запит так само, як у ваших інших робочих файлах
      const { data, error } = await supabase
        .from('work_orders') // якщо таблиця в базі називається з малої літери, або 'WorkOrder'
        .select('*')
        .order('due_date', { ascending: true });

      if (error) {
        // Спробуємо альтернативне ім'я таблиці, якщо перше видало помилку (залежно від конвенції вашої бази)
        const { data: altData, error: altError } = await supabase
          .from('WorkOrder')
          .select('*')
          .order('due_date', { ascending: true });
          
        if (altError) {
          console.error("Помилка Supabase при завантаженні нарядів:", altError);
          return [];
        }
        return altData;
      }
      return data;
    },
  });

  const orders = Array.isArray(rawOrders) ? rawOrders : [];

  // Розрахунок сітки календаря (Понеділок - Неділя)
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = [];
  let day = gridStart;
  while (day <= gridEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  // Фільтрація нарядів, дедлайн яких збігається з конкретним днем на календарі
  const getOrdersForDay = (date) => {
    if (!orders.length) return [];
    
    return orders.filter(o => {
      if (!o) return false;
      // Згідно з вашим WorkOrder.json, поле називається due_date
      const dateStr = o.due_date || o.creation_date;
      if (!dateStr) return false;

      try {
        // Очищаємо ISO дату від часу (залишаємо тільки YYYY-MM-DD)
        const cleanISO = String(dateStr).split('T')[0].trim();
        return isSameDay(parseISO(cleanISO), date);
      } catch (e) {
        return false;
      }
    });
  };

  const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      
      {/* Верхня панель */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 capitalize">
              {format(currentMonth, 'LLLL yyyy', { locale: uk })}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Всього завантажено з бази Supabase: <span className="font-bold text-slate-700">{orders.length} нарядів</span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-medium" onClick={() => setCurrentMonth(new Date())}>
            Сьогодні
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Сітка календаря */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {/* Дні тижня */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
          {WEEKDAYS.map(wd => (
            <div key={wd} className="py-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
              {wd}
            </div>
          ))}
        </div>

        {/* Клітинки днів */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-200 border-l border-t border-slate-200">
          {days.map((d, idx) => {
            const dayOrders = getOrdersForDay(d);
            const inMonth = isSameMonth(d, currentMonth);
            const today = isToday(d);
            
            return (
              <div
                key={idx}
                className={`min-h-[150px] p-2 flex flex-col justify-between transition-colors ${
                  !inMonth ? 'bg-slate-50/40 text-slate-400' : 'bg-background'
                } ${idx % 7 === 5 || idx % 7 === 6 ? 'bg-slate-50/20' : ''}`}
              >
                {/* Номер дня */}
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-slate-400">
                    {dayOrders.length > 0 && `Робіт: ${dayOrders.length}`}
                  </span>
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    today
                      ? 'bg-blue-600 text-white font-black shadow-md'
                      : inMonth
                      ? 'text-slate-800 bg-slate-100 font-semibold'
                      : 'text-slate-400'
                  }`}>
                    {format(d, 'd')}
                  </span>
                </div>

                {/* Перелік нарядів на це число (як на скріншоті) */}
                <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[110px] pr-0.5 scrollbar-thin">
                  {dayOrders.map(order => {
                    if (!order) return null;
                    
                    // Визначаємо колір з констант проекту
                    const statusStyle = STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-800 border-slate-300';

                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedOrder(order); // Записуємо вибраний наряд для модалки
                        }}
                        className={`w-full text-left p-1.5 rounded-lg text-[11px] leading-tight border transition-all hover:scale-[1.02] hover:brightness-95 active:scale-[0.98] block shadow-xs font-bold ${statusStyle}`}
                      >
                        {/* ПІБ Пацієнта */}
                        <div className="truncate flex items-center gap-1">
                          <User className="w-3 h-3 opacity-70 shrink-0" />
                          <span>{order.patient_name || 'Без імені'}</span>
                        </div>
                        
                        {/* Назва клініки / Лікар */}
                        {(order.clinic_name || order.doctor_name) && (
                          <div className="text-[9px] opacity-75 truncate mt-1 pt-1 border-t border-black/5 flex items-center gap-1 font-medium">
                            <Building className="w-2.5 h-2.5 opacity-60 shrink-0" />
                            <span>{order.clinic_name || order.doctor_name}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Нижня легенда кольорів */}
      <div className="bg-white border p-4 rounded-xl shadow-sm">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Колірні індикатори статусів:</h4>
        <div className="flex flex-wrap gap-3">
          {STATUS_COLORS && Object.entries(STATUS_COLORS).map(([status, cls]) => {
            const bgDot = cls.split(' ')[0] || 'bg-slate-200';
            return (
              <div key={status} className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                <span className={`w-2.5 h-2.5 rounded-full ${bgDot} border`} />
                <span className="text-xs font-semibold capitalize text-slate-700">{status}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ОГЛЯД НАРЯДУ (Вікно детальної інформації при кліку) */}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          open={selectedOrder !== null}
          onClose={() => setSelectedOrder(null)}
          onEdit={() => {}} // Передаємо пусту функцію-заглушку, щоб уникнути помилок всередині OrderDetail
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}