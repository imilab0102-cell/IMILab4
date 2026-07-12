import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { format, parseISO } from 'date-fns';
import { Loader2, AlertCircle } from 'lucide-react';

export default function PublicOrderView() {
  const { id } = useParams();

  const { data: order, isLoading: orderLoading, error: orderError } = useQuery({
    queryKey: ['public-order', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('WorkOrder')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: template } = useQuery({
    queryKey: ['invoiceTemplate'],
    queryFn: async () => {
      const { data } = await supabase.from('InvoiceTemplate').select('*').maybeSingle();
      return data || {};
    },
  });

  if (orderLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (orderError || !order) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h1 className="text-xl font-bold text-slate-900">Наряд не знайдено</h1>
      <p className="text-slate-500 mt-2">Посилання застаріло або наряд було видалено</p>
    </div>
  );

  const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
  const shades = typeof order.tooth_shades === 'string' ? JSON.parse(order.tooth_shades) : (order.tooth_shades || {});

  const getCurrencySymbol = (code) => {
    if (code === 'USD') return '$';
    if (code === 'EUR') return '€';
    return '₴';
  };

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-2 md:py-12 md:px-4 flex justify-center font-sans text-slate-800">
      <div className="w-full max-w-[800px] bg-white shadow-[0_0_50px_rgba(0,0,0,0.1)] p-6 md:p-12 relative overflow-hidden min-h-[1100px]">

        {/* TOP HEADER */}
        <div className="flex justify-between items-start mb-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tighter mb-2">
              ЗАКАЗ-НАРЯД
            </h1>
            <div className="space-y-4 mt-8">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-slate-400 whitespace-nowrap">Пациент (ФИО):</span>
                <div className="flex-1 border-b-2 border-slate-100 pb-1 font-bold text-lg px-2">
                  {order.patient_name || '___________________________'}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-slate-400 whitespace-nowrap">Доктор (ФИО):</span>
                <div className="flex-1 border-b-2 border-slate-100 pb-1 font-bold text-base px-2">
                  {order.doctor_name || '___________________________'}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-slate-400 whitespace-nowrap">Клиника:</span>
                <div className="flex-1 border-b-2 border-slate-100 pb-1 font-bold text-base px-2">
                  {order.clinic_name || '___________________________'}
                </div>
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center p-2">
                <img
                  src="https://media.base44.com/images/public/6a2586df519da133b2eddb2b/81b6f23b1_photo_2026-06-07_18-59-57.jpg"
                  alt="Logo"
                  className="w-full h-full object-contain invert"
                />
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-black tracking-tighter leading-none">IMILAB</h2>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">зуботехническая лаборатория</p>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 font-medium space-y-0.5 mt-2">
              <p>{template?.company_address || 'ул. Центральная, 1А'}</p>
              <p>тел. {template?.company_phone || '+380 66 927 8019'}</p>
              <p>Email: {template?.company_email || 'info@imilab.com'}</p>
            </div>
          </div>
        </div>

        {/* ACCESSORIES BOX */}
        <div className="border-2 border-sky-400 rounded-2xl p-4 md:p-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-sky-500 tracking-wider">Количество ложек</span>
              <div className="flex-1 border-b border-sky-200 min-h-[20px]"></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-sky-500 tracking-wider">Трансфер/винт</span>
              <div className="flex-1 border-b border-sky-200 min-h-[20px]"></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-sky-500 tracking-wider">Аналоги</span>
              <div className="flex-1 border-b border-sky-200 min-h-[20px]"></div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-sky-500 tracking-wider">Абатменты</span>
              <div className="flex-1 border-b border-sky-200 min-h-[20px]"></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-sky-500 tracking-wider">Лицевая дуга</span>
              <div className="flex-1 border-b border-sky-200 min-h-[20px]"></div>
            </div>
          </div>
        </div>

        {/* WORK SCHEMA */}
        <div className="border-2 border-sky-400 rounded-[2.5rem] p-8 mb-8 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-6">
            <h3 className="text-xs font-black uppercase text-sky-500 tracking-[0.2em]">Схема работы</h3>
          </div>
          <p className="text-[8px] text-center text-slate-400 uppercase font-bold tracking-wider mb-8">
            (О – опорный зуб, Х – промежуток, V – имплантат, П – полноанатомическая коронка, К – каркас под облицовку)
          </p>

          <div className="flex flex-col gap-10 items-center overflow-x-auto pb-4">
            {/* Top Teeth */}
            <div className="flex gap-1 md:gap-2">
              {[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28].map(num => (
                <div key={num} className="flex flex-col items-center gap-1 min-w-[30px]">
                  <span className="text-[10px] font-bold text-slate-400">{num}</span>
                  <div className={`w-8 h-10 border-2 rounded-lg flex items-center justify-center text-[10px] font-black ${shades[num] ? 'border-sky-500 bg-sky-50 text-sky-600 shadow-lg shadow-sky-100' : 'border-slate-100 text-slate-200'}`}>
                    {num > 20 ? '🦷' : '🦷'}
                  </div>
                </div>
              ))}
            </div>
            {/* Bottom Teeth */}
            <div className="flex gap-1 md:gap-2">
              {[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38].map(num => (
                <div key={num} className="flex flex-col items-center gap-1 min-w-[30px]">
                  <div className={`w-8 h-10 border-2 rounded-lg flex items-center justify-center text-[10px] font-black ${shades[num] ? 'border-sky-500 bg-sky-50 text-sky-600 shadow-lg shadow-sky-100' : 'border-slate-100 text-slate-200'}`}>
                    🦷
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{num}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MATERIAL AND COLOR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div className="border-2 border-sky-400 rounded-[2rem] p-6 space-y-6">
            <h3 className="text-[11px] font-black uppercase text-sky-500 tracking-widest text-center border-b border-sky-100 pb-3">Материал каркаса</h3>
            <div className="grid grid-cols-2 gap-4">
              {['ZrO₂', 'E-Max', 'CoCr', 'PMMA'].map((mat, i) => (
                <div key={mat} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-sky-300 flex items-center justify-center text-[8px] font-bold text-sky-600">{i+1}</div>
                  <span className="text-[11px] font-bold text-slate-600 uppercase">{mat}</span>
                </div>
              ))}
            </div>
            <div className="space-y-3 pt-4 border-t border-sky-50">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border border-slate-300 rounded"></div>
                  <span>Примерка каркаса</span>
                </div>
                <span className="text-[8px]">Дата ______</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border border-slate-300 rounded"></div>
                  <span>Примерка без глазури</span>
                </div>
                <span className="text-[8px]">Дата ______</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                <div className="w-3 h-3 border border-slate-300 rounded"></div>
                <span>Без примерки</span>
                <span className="ml-auto text-[8px]">Дата сдачи ______</span>
              </div>
            </div>
          </div>

          <div className="border-2 border-sky-400 rounded-[2rem] p-6">
            <h3 className="text-[11px] font-black uppercase text-sky-500 tracking-widest text-center border-b border-sky-100 pb-3 mb-4">Карта цвета</h3>
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Цвет VITA Classic:</span>
                <div className="flex-1 border-b-2 border-slate-50 font-black text-blue-600 px-2">
                   {Object.values(shades).map(s => s.neck || s.incisal).filter(Boolean).join(', ') || '__________'}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">CHROMASCOP:</span>
                <div className="flex-1 border-b-2 border-slate-50"></div>
              </div>

              <div className="flex justify-around items-center pt-4">
                 <div className="text-center opacity-20"><span className="text-3xl">🦷</span><p className="text-[8px] font-bold uppercase mt-1">Фронт</p></div>
                 <div className="text-center opacity-20"><span className="text-3xl">🦷</span><p className="text-[8px] font-bold uppercase mt-1">Бок</p></div>
              </div>
            </div>
          </div>
        </div>

        {/* SERVICES TABLE */}
        <div className="mb-10 overflow-hidden rounded-[2rem] border-2 border-slate-100">
           <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                  <th className="p-4 border-r border-slate-800">№</th>
                  <th className="p-4 border-r border-slate-800">№ Зуба</th>
                  <th className="p-4 border-r border-slate-800">Наименование</th>
                  <th className="p-4 border-r border-slate-800 text-center">Кол-во</th>
                  <th className="p-4 border-r border-slate-800 text-right">Цена</th>
                  <th className="p-4 text-right">Стоимость</th>
                </tr>
              </thead>
              <tbody className="text-xs font-bold text-slate-700 divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 border-r border-slate-100 text-slate-300 font-black">{idx + 1}</td>
                    <td className="p-4 border-r border-slate-100 text-blue-600">{item.tooth_number || '—'}</td>
                    <td className="p-4 border-r border-slate-100">{item.service_name || item.name}</td>
                    <td className="p-4 border-r border-slate-100 text-center">{item.quantity || 1}</td>
                    <td className="p-4 border-r border-slate-100 text-right text-slate-400">{item.unit_price} {getCurrencySymbol(item.price_currency)}</td>
                    <td className="p-4 text-right font-black text-slate-900">
                      {(item.unit_price * (item.quantity || 1)).toLocaleString()} {getCurrencySymbol(item.price_currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
           </table>
        </div>

        {/* FOOTER */}
        <div className="space-y-8 mt-auto">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-black uppercase text-slate-400">Описание:</span>
            <div className="flex-1 border-b-2 border-slate-50 pb-2 text-sm italic text-slate-600">
               {order.notes || '-'}
            </div>
          </div>
          <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-widest pt-10">
             <div className="flex gap-2">Дата примерки: <span className="text-slate-800 border-b border-slate-200 min-w-[100px]"></span></div>
             <div className="flex gap-2">Дата сдачи: <span className="text-slate-800 border-b border-slate-200 min-w-[100px]">{order.completion_date ? format(parseISO(order.completion_date), 'dd.MM.yyyy') : ''}</span></div>
          </div>
          <div className="text-center pt-12">
             <p className="text-[9px] text-slate-300 font-bold uppercase tracking-[0.5em]">IMILAB DIGITAL DENTAL SYSTEM</p>
          </div>
        </div>

        {/* SIDE BAR STYLE STRIP */}
        <div className="absolute top-0 right-0 w-2 h-full bg-sky-400 opacity-20"></div>
      </div>
    </div>
  );
}
