import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { format, parseISO } from 'date-fns';
import { Loader2, AlertCircle, Coins, CheckCircle2 } from 'lucide-react';
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
        return { USD: 41.5, EUR: 44.5 };
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
  const currentRates = { USD: rates.USD || 41.5, EUR: rates.EUR || 44.5 };

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
      <div className="flex flex-col items-center min-w-[32px] sm:min-w-[40px]">
        <span className={`text-[8px] sm:text-[9px] font-black mb-1 ${isSelected ? 'text-blue-600' : 'text-slate-300'}`}>{number}</span>
        <div className={`relative w-7 h-9 sm:w-8 sm:h-10 flex items-center justify-center rounded-lg border transition-all ${isSelected ? 'bg-blue-50 border-blue-200 shadow-sm' : 'border-transparent'}`}>
          <img
            src={imageSrc}
            alt={number}
            className={`w-full h-full object-contain ${isSelected ? 'opacity-100' : 'opacity-20 grayscale'}`}
          />
          {isSelected && toothShade && (
            <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-[7px] font-black px-1 rounded-sm shadow-sm z-10">
              {toothShade.neck || toothShade.incisal}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 overflow-x-hidden">
      {/* Header Sticky */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-lg border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4 flex justify-between items-center shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full whitespace-nowrap">Наряд №{order.order_number}</span>
            <span className="hidden sm:inline text-[9px] font-black uppercase text-slate-400">IMILab System</span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none truncate pr-2">{order.patient_name || '—'}</h2>
        </div>
        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center p-1.5 shadow-lg shrink-0">
          <img
            src="https://media.base44.com/images/public/6a2586df519da133b2eddb2b/81b6f23b1_photo_2026-06-07_18-59-57.jpg"
            alt="Logo"
            className="w-full h-full object-contain invert"
          />
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">

        {/* Patient & Doctor Card */}
        <div className="bg-white p-4 sm:p-5 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
           <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 text-lg">🏥</div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase text-slate-400 font-black tracking-widest mb-0.5">Клініка</p>
                <p className="font-bold text-slate-800 text-sm sm:text-base leading-tight break-words">{order.clinic_name || 'Приватна практика'}</p>
              </div>
           </div>
           <div className="flex items-start gap-3 border-t border-slate-50 pt-4">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 text-lg">👨‍⚕️</div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase text-slate-400 font-black tracking-widest mb-0.5">Лікар</p>
                <p className="font-bold text-slate-800 text-sm sm:text-base leading-tight break-words">{order.doctor_name || '—'}</p>
              </div>
           </div>
        </div>

        {/* Dates Grid */}
        <div className="bg-white p-4 sm:p-5 rounded-[2rem] shadow-sm border border-slate-100 grid grid-cols-2 gap-4">
           <div className="space-y-1 border-r border-slate-100 pr-2">
              <p className="text-[9px] uppercase text-slate-400 font-black tracking-widest">Поступлення</p>
              <p className="font-bold text-slate-800 text-xs sm:text-sm">{order.creation_date ? format(parseISO(order.creation_date), 'dd.MM.yyyy') : '—'}</p>
           </div>
           <div className="space-y-1 pl-2 text-right sm:text-left">
              <p className="text-[9px] uppercase text-slate-400 font-black tracking-widest">План здачі</p>
              <p className="font-black text-blue-600 text-xs sm:text-sm">{order.due_date ? format(parseISO(order.due_date), 'dd.MM.yyyy') : '—'}</p>
           </div>
        </div>

        {/* ACCESSORIES CARD (BACK FROM PREVIOUS VERSION) */}
        <div className="bg-sky-50/50 p-5 rounded-[2rem] border-2 border-sky-100/50 space-y-3">
          <p className="text-[9px] font-black uppercase text-sky-600 tracking-widest flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Комплектація замовлення
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {[
              { label: 'Кількість ложок', val: order.trays_count },
              { label: 'Трансфер/гвинт', val: order.transfers_count },
              { label: 'Аналоги', val: order.analogs_count },
              { label: 'Абатменти', val: order.abutments_count },
              { label: 'Лицьова дуга', val: order.face_bow ? 'Так' : '' }
            ].map((acc, idx) => (
              <div key={idx} className="flex items-center justify-between border-b border-sky-100 pb-1">
                <span className="text-[10px] font-bold text-sky-800/60 uppercase">{acc.label}</span>
                <span className="text-xs font-black text-sky-900">{acc.val || '—'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* TOOTH CHART */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-slate-50/50 flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-500">
            <span>Зубна карта (FDI)</span>
            <div className="flex gap-4">
              <span className="text-blue-500 font-black">R</span>
              <span className="text-blue-500 font-black">L</span>
            </div>
          </div>
          <div className="p-3 sm:p-6 overflow-x-auto bg-white">
            <div className="flex flex-col gap-4 py-2 min-w-max mx-auto w-fit">
              <div className="flex flex-col gap-2">
                <div className="flex justify-center gap-0.5 sm:gap-1.5 px-4">
                  <div className="flex gap-0.5">{UPPER_LEFT.map(num => <ToothIcon key={num} number={num} />)}</div>
                  <div className="w-px h-10 bg-slate-100 self-center mx-1"></div>
                  <div className="flex gap-0.5">{UPPER_RIGHT.map(num => <ToothIcon key={num} number={num} />)}</div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-center gap-0.5 sm:gap-1.5 px-4">
                  <div className="flex gap-0.5">{LOWER_LEFT.map(num => <ToothIcon key={num} number={num} />)}</div>
                  <div className="w-px h-10 bg-slate-100 self-center mx-1"></div>
                  <div className="flex gap-0.5">{LOWER_RIGHT.map(num => <ToothIcon key={num} number={num} />)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SERVICES LIST */}
        <div className="bg-white rounded-[2rem] shadow-md border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-slate-900 flex justify-between items-center">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Перелік послуг</h3>
            <span className="text-[9px] font-black text-white bg-white/10 px-2 py-0.5 rounded-md uppercase">{items.length} поз.</span>
          </div>
          <div className="divide-y divide-slate-50">
            {items.map((item, idx) => (
              <div key={idx} className="px-4 py-3 sm:px-6 sm:py-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div className="min-w-0 flex-1 mr-4">
                  <p className="font-bold text-slate-800 text-xs sm:text-sm leading-snug break-words">{item.service_name || item.name}</p>
                  <p className="text-[8px] sm:text-[9px] text-blue-500 font-black uppercase tracking-wider mt-0.5">
                    {item.teeth_numbers ? `Зуби: ${item.teeth_numbers}` : 'Загальна робота'} • x{item.quantity || 1}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-slate-900 text-sm sm:text-base">{(item.unit_price * (item.quantity || 1)).toLocaleString()} {getCurrencySymbol(item.price_currency)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* TOTALS BOX */}
          <div className="bg-slate-950 p-5 sm:p-8">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Розрахунок</p>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                  <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">{order.payment_status || 'Очікує'}</span>
                </div>
              </div>

              <div className="space-y-2 py-2">
                {Object.entries(finalTotals).map(([cur, val]) => (
                  <div key={cur} className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase text-slate-500">{cur}:</span>
                    <span className="text-lg sm:text-xl font-black text-white tracking-tighter">
                      {Math.round(val).toLocaleString()} {getCurrencySymbol(cur)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-between items-baseline">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Разом до сплати:</span>
                <div className="text-right">
                  <span className="text-3xl sm:text-4xl font-black text-white tracking-tighter leading-none">
                    {Math.round(totalInUah).toLocaleString()}
                  </span>
                  <span className="text-sm font-black text-blue-400 ml-1 uppercase">грн</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap gap-x-4 gap-y-2 opacity-40">
                <div className="flex items-center gap-1.5">
                   <Coins className="w-3 h-3 text-slate-400" />
                   <span className="text-[8px] font-bold text-slate-300 uppercase tracking-wider">USD: {currentRates.USD}</span>
                </div>
                <div className="flex items-center gap-1.5">
                   <Coins className="w-3 h-3 text-slate-400" />
                   <span className="text-[8px] font-bold text-slate-300 uppercase tracking-wider">EUR: {currentRates.EUR}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TECHNICAL DETAILS & MATERIALS & TRIALS (BACK FROM PREVIOUS VERSION) */}
        <div className="space-y-4">
           {/* Material & Shades Card */}
           <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Технічні специфікації</h3>
                {(() => {
                    const materialKeywords = ['ZrO2', 'E-Max', 'CoCr', 'PMMA'];
                    const detected = materialKeywords.filter(mat =>
                      items.some(i => (i.service_name || '').toLowerCase().includes(mat.toLowerCase()))
                    );
                    return (
                      <div className="flex gap-1.5">
                        {detected.map(m => (
                          <span key={m} className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black rounded-md uppercase">✓ {m}</span>
                        ))}
                      </div>
                    );
                })()}
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {Object.entries(shades).map(([tooth, s]) => (
                  <div key={tooth} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-50 last:border-0">
                    <span className="font-black text-blue-600 uppercase">Зуб {tooth} (Колір)</span>
                    <span className="font-bold text-slate-700">{s.neck ? `Ш: ${s.neck}` : ''} {s.incisal ? ` | К: ${s.incisal}` : ''}</span>
                  </div>
                ))}
                {Object.keys(shades).length === 0 && <p className="text-[10px] text-slate-400 italic">Окремі кольори не вказані</p>}
              </div>

              {/* TRIALS CHECKBOXES (AESTHETIC STYLE) */}
              <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
                 {[
                   { id: 'frame', label: 'Примірка каркаса' },
                   { id: 'bisque', label: 'Примірка без глазурі' },
                   { id: 'final', label: 'Без примірки' }
                 ].map(trial => (
                    <div key={trial.id} className="flex items-center gap-2">
                       <div className="w-4 h-4 rounded border-2 border-slate-200 flex items-center justify-center text-[10px] text-blue-600">
                          {/* Here we could check if order.trial_type matches, but using placeholder checkmark for now */}
                          {order.trial_type === trial.id ? <CheckCircle2 className="w-3 h-3 fill-blue-600 text-white" /> : null}
                       </div>
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{trial.label}</span>
                    </div>
                 ))}
              </div>
           </div>

           {/* Notes Card */}
           <div className="bg-amber-50/40 p-5 rounded-[2rem] border border-amber-100/60">
              <p className="text-[9px] font-black uppercase text-amber-600 tracking-widest mb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-600" /> Коментарі до замовлення
              </p>
              <p className="text-[11px] text-slate-600 leading-relaxed font-medium italic">
                {order.notes || 'Додаткові вказівки відсутні'}
              </p>
           </div>
        </div>

        {/* Laboratory Info / Footer */}
        <div className="pt-10 border-t border-slate-100 space-y-6">
           <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-3 bg-white border border-slate-100 rounded-2xl shadow-sm">
                 <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://imi-lab4.vercel.app/p/order/${order.id}`}
                    alt="QR"
                    className="w-20 h-20"
                 />
                 <p className="text-[7px] font-black text-slate-300 mt-2 tracking-widest uppercase">Digital Case ID</p>
              </div>

              <div className="flex flex-col items-center space-y-2">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center p-2 grayscale opacity-40">
                  <img
                    src="https://media.base44.com/images/public/6a2586df519da133b2eddb2b/81b6f23b1_photo_2026-06-07_18-59-57.jpg"
                    alt="Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-slate-800 tracking-widest">Цифрова лабораторія IMILab</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                    {template?.company_address?.split('•')[0]?.trim()}
                  </p>
                </div>
              </div>
           </div>
           <div className="text-center opacity-20">
              <p className="text-[7px] text-slate-400 font-black uppercase tracking-[0.5em]">Digital Dental Workflow v4.0</p>
           </div>
        </div>

      </div>
    </div>
  );
}
