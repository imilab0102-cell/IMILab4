import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { format, parseISO } from 'date-fns';
import { Loader2, AlertCircle, Coins } from 'lucide-react';
import { fetchExchangeRates } from '@/api/currencyService.js';

// FDI Tooth Numbering Groups for Rendering
const UPPER_LEFT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_RIGHT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_RIGHT = [31, 32, 33, 34, 35, 36, 37, 38];

const getToothImage = (num) => {
  try {
    return new URL(`../assets/teeth/${num}.png`, import.meta.url).href;
  } catch (e) {
    return null;
  }
};

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

  const { data: exchangeRates } = useQuery({
    queryKey: ['exchangeRates'],
    queryFn: async () => {
      try {
        const rates = await fetchExchangeRates();
        if (rates && rates.USD > 10) {
          localStorage.setItem('public_exchangeRates', JSON.stringify(rates));
          return rates;
        }
        throw new Error('Invalid rates from API');
      } catch (e) {
        const cached = localStorage.getItem('public_exchangeRates');
        if (cached) return JSON.parse(cached);
        return { USD: 41.5, EUR: 44.5 }; // Фолбек якщо взагалі нічого немає
      }
    },
    staleTime: 300000,
  });

  if (orderLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (orderError || !order) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h1 className="text-xl font-bold text-slate-900">Замовлення не знайдено</h1>
      <p className="text-slate-500 mt-2">Посилання застаріло або наряд було видалено</p>
    </div>
  );

  const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
  const shades = typeof order.tooth_shades === 'string' ? JSON.parse(order.tooth_shades) : (order.tooth_shades || {});

  let selectedTeeth = [];
  if (Array.isArray(order.selected_teeth)) {
    selectedTeeth = order.selected_teeth.map(t => parseInt(t));
  } else if (typeof order.selected_teeth === 'string' && order.selected_teeth.startsWith('{')) {
    selectedTeeth = order.selected_teeth.replace(/[{}]/g, '').split(',').map(t => parseInt(t.trim())).filter(t => !isNaN(t));
  } else {
    items.forEach(i => {
      if (i.teeth_numbers) {
        if (Array.isArray(i.teeth_numbers)) i.teeth_numbers.forEach(n => selectedTeeth.push(parseInt(n)));
        else selectedTeeth.push(parseInt(i.teeth_numbers));
      }
    });
  }
  selectedTeeth = [...new Set(selectedTeeth.filter(t => !isNaN(t)))];

  const getCurrencySymbol = (code) => {
    if (code === 'USD') return '$';
    if (code === 'EUR') return '€';
    return '₴';
  };

  const totals = { UAH: 0, USD: 0, EUR: 0 };
  items.forEach(item => {
    const cur = item.price_currency || 'UAH';
    if (totals[cur] !== undefined) {
      totals[cur] += parseFloat(item.unit_price || 0) * (parseInt(item.quantity) || 1);
    }
  });

  const discountPercent = parseFloat(order.manual_discount_percent) || parseFloat(order.doctor_discount) || 0;
  const rates = exchangeRates || { USD: 41.5, EUR: 44.5 };

  // ВАЖЛИВО: Використовуємо ті ж самі назви полів, що і в OrderDetail.jsx
  const currentRates = {
    USD: rates.USD || 41.5,
    EUR: rates.EUR || 44.5
  };

  const finalTotals = {};
  Object.entries(totals).forEach(([cur, val]) => {
    if (val > 0) finalTotals[cur] = val * (1 - discountPercent / 100);
  });

  const totalInUah = Object.entries(finalTotals).reduce((acc, [cur, val]) => {
    if (cur === 'UAH') return acc + val;
    return acc + (val * currentRates[cur]);
  }, 0);

  const ToothIcon = ({ number }) => {
    const isSelected = selectedTeeth.includes(number);
    const imageSrc = getToothImage(number);
    const toothShade = shades[number];

    return (
      <div className="flex flex-col items-center min-w-[35px] md:min-w-[40px]">
        <span className={`text-[9px] font-black mb-1 ${isSelected ? 'text-blue-600' : 'text-slate-300'}`}>{number}</span>
        <div className={`relative w-8 h-10 flex items-center justify-center rounded-lg border transition-all ${isSelected ? 'bg-blue-50 border-blue-200 shadow-sm' : 'border-transparent'}`}>
          <img
            src={imageSrc}
            alt={number}
            className={`w-full h-full object-contain ${isSelected ? 'opacity-100' : 'opacity-20 grayscale'}`}
          />
          {isSelected && toothShade && (
            <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-[7px] font-black px-1 rounded-sm shadow-sm">
              {toothShade.neck || toothShade.incisal}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-2 md:py-12 md:px-4 flex justify-center font-sans text-slate-800">
      <div className="w-full max-w-[850px] bg-white shadow-[0_0_50px_rgba(0,0,0,0.1)] p-6 md:p-12 relative overflow-hidden min-h-[1100px]">

        {/* TOP HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start mb-10 gap-8">
          <div className="flex-1 w-full">
            <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tighter mb-6 uppercase">
              ЗАМОВЛЕННЯ-НАРЯД
            </h1>
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Пацієнт (ПІБ):</span>
                <div className="flex-1 border-b-2 border-slate-100 pb-1 font-black text-xl text-slate-900">
                  {order.patient_name}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Лікар (ПІБ):</span>
                <div className="flex-1 border-b-2 border-slate-100 pb-1 font-bold text-slate-700">
                  {order.doctor_name}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap text-blue-500">Дата поступлення:</span>
                <div className="flex-1 border-b-2 border-blue-50 pb-1 font-bold text-blue-700">
                  {order.creation_date ? format(parseISO(order.creation_date), 'dd.MM.yyyy') : '—'}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Клініка:</span>
                <div className="flex-1 border-b-2 border-slate-100 pb-1 font-bold text-slate-700">
                  {order.clinic_name}
                </div>
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end shrink-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center p-2 shadow-xl">
                <img
                  src="https://media.base44.com/images/public/6a2586df519da133b2eddb2b/81b6f23b1_photo_2026-06-07_18-59-57.jpg"
                  alt="Logo"
                  className="w-full h-full object-contain invert"
                />
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-black tracking-tighter leading-none text-slate-900">IMILab</h2>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600 mt-1">digital dental system</p>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed text-right">
              <p>{template?.company_address}</p>
              <p>тел. {template?.company_phone}</p>
              <p className="text-blue-500">{template?.company_email}</p>
            </div>
          </div>
        </div>

        <div className="border-2 border-sky-400 rounded-2xl p-4 md:p-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-sky-500 tracking-wider">Кількість ложок</span>
              <div className="flex-1 border-b border-sky-200 min-h-[20px]"></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-sky-500 tracking-wider">Трансфер/гвинт</span>
              <div className="flex-1 border-b border-sky-200 min-h-[20px]"></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-sky-500 tracking-wider">Аналоги</span>
              <div className="flex-1 border-b border-sky-200 min-h-[20px]"></div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-sky-500 tracking-wider">Абатменти</span>
              <div className="flex-1 border-b border-sky-200 min-h-[20px]"></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-sky-500 tracking-wider">Лицьова дуга</span>
              <div className="flex-1 border-b border-sky-200 min-h-[20px]"></div>
            </div>
          </div>
        </div>

        {/* WORK SCHEMA - MOBILE ADAPTIVE */}
        <div className="border-4 border-slate-900 rounded-[2.5rem] p-4 md:p-10 mb-8 bg-slate-50/50">
          <div className="text-center mb-6 md:mb-8">
            <h3 className="text-xs font-black uppercase text-slate-900 tracking-[0.3em] inline-block border-b-2 border-slate-900 pb-1">Схема роботи</h3>
          </div>

          <div className="flex flex-col gap-6 md:gap-8">
            {/* Top Row - Split on mobile */}
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-2">
              <div className="flex justify-center gap-1">{UPPER_LEFT.map(num => <ToothIcon key={num} number={num} />)}</div>
              <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1"></div>
              <div className="flex justify-center gap-1">{UPPER_RIGHT.map(num => <ToothIcon key={num} number={num} />)}</div>
            </div>

            <div className="h-px bg-slate-200 w-full relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-4 text-[8px] md:text-[10px] font-black text-slate-300 tracking-widest uppercase whitespace-nowrap">Dental Chart</div>
            </div>

            {/* Bottom Row - Split on mobile */}
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-2">
              <div className="flex justify-center gap-1">{LOWER_LEFT.map(num => <ToothIcon key={num} number={num} />)}</div>
              <div className="hidden sm:block w-px h-8 bg-slate-200 mx-1"></div>
              <div className="flex justify-center gap-1">{LOWER_RIGHT.map(num => <ToothIcon key={num} number={num} />)}</div>
            </div>
          </div>

          <div className="mt-8 flex justify-center gap-6 md:gap-10 text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Ліва сторона (R)</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Права сторона (L)</span>
              <div className="w-2 h-2 rounded-full bg-blue-500" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div className="space-y-6">
            <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-6 shadow-sm">
               <h3 className="text-[11px] font-black uppercase text-slate-400 tracking-widest mb-4">Технічні деталі</h3>
               <div className="space-y-3">
                 {Object.entries(shades).map(([tooth, s]) => (
                   <div key={tooth} className="flex items-center justify-between text-sm">
                     <span className="font-black text-blue-600">Зуб {tooth}:</span>
                     <span className="font-bold text-slate-700">
                       {s.neck ? `Шийка: ${s.neck}` : ''} {s.incisal ? ` | Край: ${s.incisal}` : ''}
                     </span>
                   </div>
                 ))}
                 {Object.keys(shades).length === 0 && <p className="text-xs text-slate-400 italic">Специфічні кольори не вказані</p>}
               </div>
               <div className="space-y-3 pt-4 border-t border-slate-100 mt-4">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border border-slate-300 rounded"></div>
                      <span>Примірка каркаса</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border border-slate-300 rounded"></div>
                      <span>Примірка без глазурі</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                    <div className="w-3 h-3 border border-slate-300 rounded"></div>
                    <span>Без примірки</span>
                  </div>
               </div>
            </div>
            <div className="bg-slate-900 text-white rounded-[2rem] p-6 shadow-xl">
               <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-4">Матеріал</h3>
               <div className="grid grid-cols-1 gap-3">
                  {(() => {
                    const materialKeywords = ['ZrO2', 'E-Max', 'CoCr', 'PMMA'];
                    const detected = materialKeywords.filter(mat =>
                      items.some(item =>
                        (item.service_name || '').toLowerCase().includes(mat.toLowerCase()) ||
                        (item.name || '').toLowerCase().includes(mat.toLowerCase())
                      )
                    );

                    if (detected.length === 0) {
                      return <p className="text-[10px] text-slate-500 italic">Не вказано в послугах</p>;
                    }

                    return detected.map(m => (
                      <div key={m} className="flex items-center gap-3">
                         <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black shadow-lg shadow-blue-900/50">✓</div>
                         <span className="text-sm font-black uppercase tracking-wider">{m}</span>
                      </div>
                    ));
                  })()}
               </div>
            </div>
          </div>

          <div className="bg-blue-600 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-200 flex flex-col justify-between">
            <div>
               <h3 className="text-xs font-black uppercase text-blue-200 tracking-[0.2em] mb-6">Розрахунок у валютах</h3>
               <div className="space-y-4">
                 {Object.entries(finalTotals).map(([cur, val]) => (
                   <div key={cur} className="flex justify-between items-baseline border-b border-blue-500/50 pb-2">
                     <span className="text-xs font-bold uppercase text-blue-100">{cur}:</span>
                     <span className="text-2xl font-black">{val.toLocaleString()} {getCurrencySymbol(cur)}</span>
                   </div>
                 ))}
               </div>
            </div>
            <div className="mt-8 pt-4 border-t-2 border-blue-400/50">
               <div className="flex justify-between items-baseline">
                 <span className="text-xs font-black uppercase text-blue-100">Разом у гривні:</span>
                 <div className="text-right">
                    <span className="text-4xl font-black leading-none">{totalInUah.toLocaleString()}</span>
                    <span className="text-lg font-black ml-1 uppercase">грн</span>
                 </div>
               </div>
               <div className="mt-2 flex items-center gap-2 text-[8px] font-bold text-blue-100 uppercase tracking-widest opacity-60">
                 <Coins className="w-3 h-3" /> Курси: USD {currentRates.USD} | EUR {currentRates.EUR}
               </div>
            </div>
          </div>
        </div>

        <div className="mb-10 overflow-hidden rounded-[2.5rem] border-2 border-slate-100 shadow-sm">
           <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  <th className="p-6">№</th>
                  <th className="p-6">Найменування послуги</th>
                  <th className="p-6 text-center">К-сть</th>
                  <th className="p-6 text-right">Сума</th>
                </tr>
              </thead>
              <tbody className="text-sm font-bold text-slate-700 divide-y divide-slate-50">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6 text-slate-300 font-black">{idx + 1}</td>
                    <td className="p-6">
                      <p className="font-black text-slate-800 tracking-tight">{item.service_name || item.name}</p>
                      {item.teeth_numbers && <span className="text-[10px] text-blue-500 font-black uppercase">Зуб: {item.teeth_numbers}</span>}
                    </td>
                    <td className="p-6 text-center font-black text-slate-900">x{item.quantity || 1}</td>
                    <td className="p-6 text-right font-black text-slate-900">
                      {(item.unit_price * (item.quantity || 1)).toLocaleString()} {getCurrencySymbol(item.price_currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
           </table>
        </div>

        <div className="space-y-10 mt-12">
          <div className="bg-slate-50 p-6 rounded-3xl border-2 border-dashed border-slate-200">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Примітки:</span>
            <p className="text-sm italic text-slate-600 leading-relaxed font-medium">
               {order.notes || 'Додаткові вказівки відсутні'}
            </p>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-6 py-6 border-t border-slate-100">
             <div className="flex flex-col items-center md:items-start gap-1">
               <span className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Дата поступлення</span>
               <div className="w-40 border-b-2 border-slate-100 h-6 text-center font-bold text-slate-800">
                 {order.creation_date ? format(parseISO(order.creation_date), 'dd.MM.yyyy') : ''}
               </div>
             </div>
             <div className="flex flex-col items-center md:items-end gap-1">
               <span className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Дата здачі (план)</span>
               <div className="w-40 border-b-2 border-slate-100 h-6 text-center font-bold text-slate-800">
                 {order.due_date ? format(parseISO(order.due_date), 'dd.MM.yyyy') : ''}
               </div>
             </div>
          </div>

          <div className="text-center">
             <p className="text-[10px] text-slate-300 font-black uppercase tracking-[0.6em]">IMILab DIGITAL DENTAL SYSTEM</p>
          </div>
        </div>

        <div className="absolute top-0 right-0 w-3 h-full bg-blue-600"></div>
      </div>
    </div>
  );
}
