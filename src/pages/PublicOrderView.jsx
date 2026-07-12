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
    <div className="min-h-screen bg-slate-50 py-10 px-4 md:px-10 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-[2rem] overflow-hidden print:shadow-none print:rounded-none">
        {/* Header */}
        <div className="p-8 border-b-4" style={{ borderColor: template?.header_color || '#3b82f6' }}>
          <div className="flex flex-col md:flex-row justify-between items-start gap-6">
            <div>
              {template?.logo_url ? (
                <img src={template.logo_url} alt="Logo" className="h-16 mb-4 object-contain grayscale" />
              ) : (
                <img
                  src="https://media.base44.com/images/public/6a2586df519da133b2eddb2b/81b6f23b1_photo_2026-06-07_18-59-57.jpg"
                  alt="IMILab"
                  className="h-16 mb-4 object-contain grayscale"
                />
              )}
              <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                {template?.company_name || 'IMILab'}
              </h1>
              <div className="mt-2 text-xs text-slate-500 leading-relaxed max-w-xs">
                {template?.company_address && <div>{template.company_address}</div>}
                {template?.company_phone && <div>Тел: {template.company_phone}</div>}
                {template?.company_email && <div>Email: {template.company_email}</div>}
              </div>
            </div>
            <div className="text-right flex-1 w-full md:w-auto">
              <div className="bg-slate-900 text-white inline-block px-4 py-2 rounded-xl font-black text-sm uppercase tracking-widest mb-4">
                {template?.invoice_title || 'НАРЯД-ЗАМОВЛЕННЯ'}
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold text-slate-800">№{order.order_number}</p>
                <p className="text-xs font-bold text-slate-400 uppercase">від {format(parseISO(order.creation_date), 'dd.MM.yyyy')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Client Info */}
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-50/50">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center shrink-0">
                <span className="text-lg">🏥</span>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Клініка</p>
                <p className="font-bold text-slate-800">{order.clinic_name || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center shrink-0">
                <span className="text-lg">👨‍⚕️</span>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Лікар</p>
                <p className="font-bold text-slate-800">{order.doctor_name || '—'}</p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center shrink-0">
                <span className="text-lg">👤</span>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Пацієнт</p>
                <p className="font-black text-slate-900 text-lg tracking-tight">{order.patient_name || '—'}</p>
              </div>
            </div>
            {order.technician_name && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-center shrink-0">
                  <span className="text-lg">⚙️</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest mb-0.5">Виконавець</p>
                  <p className="font-bold text-slate-800">{order.technician_name}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Technical Data (Teeth) */}
        {Object.keys(shades).length > 0 && (
          <div className="p-8 border-t border-slate-100">
            <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4">Технічні дані (VITA)</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(shades).map(([tooth, shade]) => (
                <div key={tooth} className="bg-white border-2 border-slate-50 rounded-2xl p-4 shadow-sm min-w-[100px] flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-sm shadow-lg shadow-blue-100">
                    {tooth}
                  </div>
                  <div className="space-y-1">
                    {shade.neck && <div className="text-[10px]"><span className="text-slate-400 font-bold uppercase mr-1 text-[8px]">Шийка:</span> <b className="text-slate-700">{shade.neck}</b></div>}
                    {shade.incisal && <div className="text-[10px]"><span className="text-slate-400 font-bold uppercase mr-1 text-[8px]">Край:</span> <b className="text-slate-700">{shade.incisal}</b></div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Services Table */}
        <div className="p-8 border-t border-slate-100">
          <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4">Перелік послуг та розрахунок</h3>
          <div className="border-2 border-slate-50 rounded-[2rem] overflow-hidden shadow-inner">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <th className="p-5">Послуга</th>
                  <th className="p-5 text-center">К-сть</th>
                  <th className="p-5 text-right">Ціна</th>
                  <th className="p-5 text-right">Сума</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                    <td className="p-5">
                      <p className="font-bold text-slate-800">{item.service_name || item.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{item.category || 'Послуга'}</p>
                    </td>
                    <td className="p-5 text-center font-bold text-slate-600">x{item.quantity || 1}</td>
                    <td className="p-5 text-right text-slate-500 text-xs">{item.unit_price} {getCurrencySymbol(item.price_currency)}</td>
                    <td className="p-5 text-right font-black text-slate-900">
                      {(item.unit_price * (item.quantity || 1)).toLocaleString()} {getCurrencySymbol(item.price_currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex justify-end">
            <div className="w-full md:w-80 bg-slate-900 text-white rounded-[2rem] p-6 shadow-xl shadow-slate-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Підсумок</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 border border-emerald-900/50">
                  {order.payment_status}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800 mt-4">
                <span className="text-xs font-black uppercase text-slate-500">Всього:</span>
                <span className="text-2xl font-black tracking-tighter" style={{ color: template?.summary_color || '#fff' }}>
                  {order.total_amount?.toLocaleString()} {getCurrencySymbol(order.currency || 'UAH')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-slate-100 bg-slate-50/30 text-center">
          <p className="text-sm font-bold text-slate-700">{template?.footer_text || 'Дякуємо за довіру!'}</p>
          <div className="mt-6 flex flex-col items-center">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-2">Звіт сформовано в IMILab</div>
            <div className="h-1.5 w-24 bg-blue-600 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
