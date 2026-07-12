import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import StatusBadge from '@/components/StatusBadge';
import { ORDER_STATUSES } from '@/lib/constants';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { 
  Calendar, UserRound, Building2, Wrench, Palette, Trash2, Save, 
  Printer, Share2, Download, Image as ImageIcon, Coins, QrCode, X
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { QRCodeCanvas } from 'qrcode.react';
import { registerPlugin } from '@capacitor/core';
import { fetchExchangeRates } from '@/api/currencyService.js';

const FunPrint = registerPlugin('FunPrint');

const PAYMENT_STATUS_STYLES = {
  'Оплачено': 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  'Частково': 'bg-amber-100 text-amber-700 hover:bg-amber-100',
  'Борг': 'bg-red-100 text-red-700 hover:bg-red-100',
};

export default function OrderDetail({ order, open, onClose, onEdit, onDuplicate, onDelete, isAdmin }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(order?.status || 'Новий');
  const [paymentStatus, setPaymentStatus] = useState(order?.payment_status || 'Борг');
  const [exchangeRates, setExchangeRates] = useState({ USD: 41.5, EUR: 44.5 });
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await fetchExchangeRates();
        if (rates && rates.USD > 10) {
          setExchangeRates({ USD: rates.USD, EUR: rates.EUR });
        }
      } catch (e) {
        // Fallback to local storage or defaults
        const cached = localStorage.getItem('exchangeRates');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.USD > 10) setExchangeRates(parsed);
          } catch (e) {}
        }
      }
    };
    if (open) loadRates();
  }, [open]);

  const { data: receiptTemplate } = useQuery({
    queryKey: ['receiptTemplate'],
    queryFn: async () => {
      const { data, error } = await supabase.from('receipt_template').select('*').limit(1).maybeSingle();
      if (error) return {};
      return data || {};
    },
  });

  useEffect(() => {
    if (order) {
      setStatus(order.status || 'Новий');
      setPaymentStatus(order.payment_status || 'Борг');
    }
  }, [order, open]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, newStatus, newPaymentStatus }) => {
      const { error } = await supabase.from('WorkOrder').update({ status: newStatus, payment_status: newPaymentStatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      onClose(); // Закриваємо вікно після успішного збереження
    },
  });

  const getParsedItems = () => {
    try {
      return typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
    } catch (e) { return []; }
  };

  const getCurrencySymbol = (code) => {
    if (code === 'USD') return '$';
    if (code === 'EUR') return '€';
    return '₴';
  };

  const generateReceiptHTML = () => {
    const tpl = receiptTemplate || {};
    const items = getParsedItems();

    // Фільтруємо послуги (прибираємо внутрішні записи техніків для чека лікаря)
    const filteredItems = items.filter(i =>
      !i.service_name?.toLowerCase().includes('технік') &&
      !i.name?.toLowerCase().includes('технік')
    );

    // Розрахунок підсумків тільки по відфільтрованим послугам
    const totals = { UAH: 0, USD: 0, EUR: 0 };
    filteredItems.forEach(item => {
      const cur = item.price_currency || 'UAH';
      if (totals[cur] !== undefined) {
        totals[cur] += parseFloat(item.unit_price || 0) * (parseInt(item.quantity) || 1);
      }
    });

    // Знижка
    const discountPercent = parseFloat(order.manual_discount_percent) || parseFloat(order.doctor_discount) || 0;
    if (discountPercent > 0) {
      totals.UAH *= (1 - discountPercent / 100);
      totals.USD *= (1 - discountPercent / 100);
      totals.EUR *= (1 - discountPercent / 100);
    }

    // Результуючий підсумок у гривні за актуальним курсом
    const totalInUah = totals.UAH + (totals.USD * exchangeRates.USD) + (totals.EUR * exchangeRates.EUR);

    // Рядки товарів з покращеним вирівнюванням
    const itemsRows = filteredItems.map(item => `
      <div style="margin-bottom:6px; font-size:10px; line-height:1.2;">
        <div style="display:flex; justify-content:space-between; align-items:start;">
          <span style="flex:1; padding-right:8px; word-break:break-word;">${item.service_name || item.name}</span>
          <span style="font-weight:bold; white-space:nowrap; text-align:right;">
            ${(parseFloat(item.unit_price || 0) * (item.quantity || 1)).toFixed(0)} ${getCurrencySymbol(item.price_currency)}
          </span>
        </div>
        <div style="font-size:8px; color:#666;">(x${item.quantity || 1})</div>
      </div>
    `).join('');

    // Колір VITA
    let teethInfo = '';
    if (order.tooth_shades) {
      try {
        const shades = typeof order.tooth_shades === 'string' ? JSON.parse(order.tooth_shades) : order.tooth_shades;
        const shadeEntries = Object.entries(shades);
        if (shadeEntries.length > 0) {
          teethInfo = `
            <div style="margin:10px 0; border-top:1px dashed #000; padding-top:5px;">
              <div style="font-weight:bold; text-transform:uppercase; font-size:10px; margin-bottom:3px;">ТЕХНІЧНІ ДАНІ:</div>
              <div style="display:flex; justify-content:space-between; font-size:10px;">
                <span>Колір (Vita):</span>
                <span style="font-weight:bold; text-align:right;">${shadeEntries.map(([t, s]) => `${t}:${s.neck||''}${s.incisal?'/'+s.incisal:''}`).join(', ')}</span>
              </div>
            </div>
          `;
        }
      } catch (e) {}
    }

    return `
      <html>
      <body style="font-family:'Courier New', Courier, monospace; width:58mm; padding:8px; margin:0; color:#000; background:white;">
        <div style="text-align:center; margin-bottom:8px;">
          ${tpl.logo_url ? `<img src="${tpl.logo_url}" style="width:35mm; height:auto; margin-bottom:4px; filter: grayscale(1);"/>` : ''}
          <div style="font-size:8px; letter-spacing:1px; text-transform:uppercase; margin-bottom:2px; color:#333;">${tpl.subtitle || 'Digital Laboratory'}</div>
          <div style="background:#000; color:#fff; display:inline-block; padding:3px 8px; font-weight:900; font-size:10px; letter-spacing:1px; text-transform:uppercase;">
            ${tpl.doc_type || 'Наряд-чек лікаря'}
          </div>
        </div>

        <div style="text-align:center; font-weight:bold; font-size:10px; margin-bottom:6px;">
          КЕЙС: #${order.order_number}
        </div>

        <div style="border-top:2px solid #000; border-bottom:2px solid #000; margin:6px 0; padding:6px 0; font-size:10px; line-height:1.4;">
          <table style="width:100%; border-collapse:collapse;">
            <tr><td style="width:40%; color:#444;">Дата:</td><td style="text-align:right; font-weight:bold;">${order.creation_date ? format(parseISO(order.creation_date), 'dd.MM.yyyy') : '--'}</td></tr>
            <tr><td style="vertical-align:top; color:#444;">Клініка:</td><td style="text-align:right; font-weight:bold; word-break:break-word;">${order.clinic_name || '—'}</td></tr>
            <tr><td style="vertical-align:top; color:#444;">Лікар:</td><td style="text-align:right; font-weight:bold; word-break:break-word;">${order.doctor_name || '—'}</td></tr>
            <tr><td style="vertical-align:top; color:#444;">Пацієнт:</td><td style="text-align:right; font-weight:bold; word-break:break-word;">${order.patient_name || '—'}</td></tr>
          </table>
        </div>

        ${teethInfo}

        <div style="margin:10px 0; border-top:1px dashed #000; padding-top:5px;">
          <div style="font-weight:bold; text-transform:uppercase; font-size:10px; margin-bottom:6px;">РОЗРАХУНОК:</div>
          ${itemsRows}
        </div>

        <div style="border:2px dashed #000; padding:8px; margin-top:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; border-bottom:1px solid #000; padding-bottom:5px;">
            <span style="font-weight:900; font-size:11px; text-transform:uppercase;">ДО ОПЛАТИ:</span>
            <span style="font-weight:900; font-size:13px;">${totalInUah.toFixed(0)} ₴</span>
          </div>

          <div style="font-size:9px; color:#000; line-height:1.4;">
            ${Object.entries(totals).filter(([_, v]) => v > 0).map(([cur, val]) => `
              <div style="display:flex; justify-content:space-between;">
                <span>Всього (${cur}):</span>
                <span style="font-weight:bold;">${val.toFixed(0)} ${getCurrencySymbol(cur)}</span>
              </div>
            `).join('')}
            <div style="display:flex; justify-content:space-between; margin-top:4px; border-top:1px solid #000; padding-top:4px;">
              <span>Статус оплати:</span>
              <span style="font-weight:bold; text-transform:uppercase;">${paymentStatus}</span>
            </div>
          </div>
        </div>

        <div style="text-align:center; margin-top:20px; border-top:2px solid #000; padding-top:10px;">
          <div style="font-size:10px; font-weight:bold; margin-bottom:4px;">${tpl.thanks_text || 'Дякуємо за співпрацю!'}</div>
          <div style="font-size:11px; font-weight:900;">${tpl.contacts || ''}</div>
        </div>
      </body>
      </html>
    `;
  };

  const handleDownloadPdf = () => {
    const html = generateReceiptHTML();
    const element = document.createElement('div');
    element.innerHTML = html;
    element.style.position = 'absolute';
    element.style.left = '-9999px';
    element.style.width = '58mm';
    element.style.background = '#ffffff';
    document.body.appendChild(element);

    setTimeout(() => {
      html2canvas(element, { scale: 3 }).then(canvas => {
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        document.body.removeChild(element);
        import('jspdf').then(({ jsPDF }) => {
          const pdf = new jsPDF('p', 'mm', [58, canvas.height * 58 / canvas.width]);
          pdf.addImage(imgData, 'JPEG', 0, 0, 58, canvas.height * 58 / canvas.width);
          const pdfBase64 = pdf.output('datauristring');
          if (window.Capacitor && FunPrint) {
             FunPrint.savePdfToFile({ data: pdfBase64, filename: `Чек_${order.order_number}.pdf` })
                .then(() => alert('✅ PDF чек готовий!'));
          } else {
             pdf.save(`Чек_${order.order_number}.pdf`);
          }
        });
      });
    }, 500);
  };

  const handleSaveReceiptAsImage = async () => {
    try {
      const html = generateReceiptHTML();
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '58mm';
      iframe.style.height = '1px'; // Почнемо з мінімальної
      iframe.style.visibility = 'hidden';
      iframe.style.left = '-9999px';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(async () => {
        try {
          const body = doc.body;
          // Важливо: обнуляємо всі відступи, щоб виміряти тільки контент
          body.style.margin = '0';
          body.style.padding = '0';
          body.style.display = 'inline-block'; // Щоб висота підлаштувалася під вміст

          // Вимірюємо реальну висоту контенту
          const width = body.offsetWidth || body.scrollWidth;
          const height = body.offsetHeight || body.scrollHeight;

          iframe.style.height = height + 'px';

          const canvas = await html2canvas(body, {
            scale: 3,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: width,
            height: height,
            x: 0,
            y: 0
          });

          const imgData = canvas.toDataURL('image/png', 1.0);
          document.body.removeChild(iframe);

          if (window.Capacitor && FunPrint) {
            await FunPrint.saveImageToGallery({
              image: imgData,
              filename: `Чек_${order.order_number}_${Date.now()}.png`
            });
            alert('✅ Чек збережено в галерею!');
          } else {
            const link = document.createElement('a');
            link.download = `Чек_${order.order_number}.png`;
            link.href = imgData;
            link.click();
          }
        } catch (err) {
          console.error(err);
          alert('Помилка: ' + err.message);
        }
      }, 1200);
    } catch (e) {
      alert(e.message);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 border-none bg-white rounded-3xl shadow-2xl">
        <div className="px-6 py-5 border-b flex justify-between items-center bg-white sticky top-0 z-20">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Наряд #{order.order_number}
            </h2>
            <p className="text-xs text-slate-500 font-medium">{order.patient_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-slate-100" onClick={handleSaveReceiptAsImage} title="Зберегти чек як фото"><ImageIcon className="w-4 h-4 text-blue-600" /></Button>
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-slate-100" onClick={() => setQrOpen(true)} title="Показати QR-код наряду"><QrCode className="w-4 h-4 text-slate-600" /></Button>
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-slate-100" onClick={handleDownloadPdf}><Download className="w-4 h-4 text-slate-600" /></Button>
            <div className="w-px h-6 bg-slate-200 mx-1" />
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-red-50 hover:text-red-500" onClick={onClose} title="Закрити"><X className="w-5 h-5" /></Button>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Основна інформація */}
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Клініка</p>
              <p className="text-sm font-semibold text-slate-700">{order.clinic_name || '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Лікар</p>
              <p className="text-sm font-semibold text-slate-700">{order.doctor_name || '—'}</p>
            </div>
          </div>

          {/* Послуги - мінімалістична таблиця */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Послуги</p>
            <div className="border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {getParsedItems().map((item, idx) => (
                    <tr key={idx} className="bg-white">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{item.service_name || item.name}</div>
                        <div className="text-[10px] text-slate-400">x{item.quantity || 1}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {(parseFloat(item.unit_price || 0) * (parseInt(item.quantity) || 1)).toLocaleString()} {getCurrencySymbol(item.price_currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/50">
                  <tr>
                    <td className="px-4 py-3 font-bold text-slate-900">Разом</td>
                    <td className="px-4 py-3 text-right">
                      {(() => {
                        const items = getParsedItems();
                        const t = { UAH: 0, USD: 0, EUR: 0 };
                        items.forEach(i => {
                          const cur = i.price_currency || 'UAH';
                          if (t[cur] !== undefined) t[cur] += parseFloat(i.unit_price || 0) * (parseInt(i.quantity) || 1);
                        });
                        const disc = parseFloat(order.manual_discount_percent) || parseFloat(order.doctor_discount) || 0;
                        return Object.entries(t)
                          .filter(([_, v]) => v > 0)
                          .map(([cur, val]) => (
                            <div key={cur} className="font-bold text-blue-600">
                              {(val * (1 - disc/100)).toLocaleString()} {getCurrencySymbol(cur)}
                            </div>
                          ));
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Зуби / Колір */}
          {order.tooth_shades && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Колір VITA</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(typeof order.tooth_shades === 'string' ? JSON.parse(order.tooth_shades) : order.tooth_shades).map(([t, s]) => (
                  <div key={t} className="px-3 py-2 border rounded-xl flex items-center gap-2">
                    <span className="w-5 h-5 bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center rounded-md">{t}</span>
                    <div className="text-[10px] text-slate-600">
                      {s.neck && <span className="mr-2">Ш:<b>{s.neck}</b></span>}
                      {s.incisal && <span>К:<b>{s.incisal}</b></span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Нотатки / Технік */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Технік</p>
                <p className="text-sm font-medium text-slate-600">{order.technician_name || 'Не призначено'}</p>
             </div>
             {order.notes && (
               <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Примітки</p>
                  <p className="text-xs text-slate-500 italic leading-relaxed">{order.notes}</p>
               </div>
             )}
          </div>

          {/* Управління статусами */}
          <div className="pt-6 border-t space-y-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                <Coins className="w-3.5 h-3.5" /> Курси:
                <span className="text-slate-600">USD: {exchangeRates.USD}</span>
                <span className="text-slate-600 ml-2">EUR: {exchangeRates.EUR}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-xs font-black text-slate-500 uppercase">Підсумок у гривні:</span>
                <span className="text-lg font-black text-blue-600">
                  {(() => {
                    const items = getParsedItems();
                    const t = { UAH: 0, USD: 0, EUR: 0 };
                    items.forEach(i => {
                      const cur = i.price_currency || 'UAH';
                      if (t[cur] !== undefined) t[cur] += parseFloat(i.unit_price || 0) * (parseInt(i.quantity) || 1);
                    });
                    const disc = parseFloat(order.manual_discount_percent) || parseFloat(order.doctor_discount) || 0;
                    const res = (t.UAH + t.USD * exchangeRates.USD + t.EUR * exchangeRates.EUR) * (1 - disc/100);
                    return res.toLocaleString(undefined, { maximumFractionDigits: 0 });
                  })()} ₴
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Статус наряду</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-blue-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Статус оплати</Label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger className={`h-11 rounded-xl border-slate-200 ${PAYMENT_STATUS_STYLES[paymentStatus]}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="Оплачено">✅ Оплачено</SelectItem>
                    <SelectItem value="Частково">🟡 Частково</SelectItem>
                    <SelectItem value="Борг">🔴 Борг</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                className="flex-1 h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all active:scale-[0.98]"
                onClick={() => saveMutation.mutate({ id: order.id, newStatus: status, newPaymentStatus: paymentStatus })}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Збереження...' : 'Зберегти зміни'}
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-12 border-2 font-bold rounded-xl"
                onClick={() => { onClose(); onEdit(order); }}
              >
                Редагувати все
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm rounded-[2rem] p-8 text-center">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-800 uppercase tracking-tight">QR-код наряду</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-medium">
              Лікар може відсканувати цей код для перегляду деталей наряду
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 flex flex-col items-center">
            <div className="p-6 bg-white border-2 border-slate-50 rounded-[2rem] shadow-inner">
              <QRCodeCanvas
                value={`https://imi-lab4.vercel.app/p/order/${order.id}`}
                size={220}
                level="H"
                includeMargin={false}
                imageSettings={{
                  src: "/favicon.ico",
                  x: undefined,
                  y: undefined,
                  height: 40,
                  width: 40,
                  excavate: true,
                }}
              />
            </div>
            <p className="mt-4 font-mono text-[10px] text-slate-400 break-all px-4">
              imi-lab4.vercel.app/p/order/${order.id}
            </p>
          </div>

          <Button
            className="mt-8 w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-100"
            onClick={() => setQrOpen(false)}
          >
            ЗАКРИТИ
          </Button>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
