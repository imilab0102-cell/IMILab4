import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/StatusBadge';
import { ORDER_STATUSES } from '@/lib/constants';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { 
  Calendar, UserRound, Building2, Wrench, Palette, Trash2, Save, 
  Printer, Share2, Download, FileText, FileSpreadsheet, Image
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { registerPlugin } from '@capacitor/core';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // === Запит шаблону чеку ===
  const { data: receiptTemplate, refetch: refetchTemplate } = useQuery({
    queryKey: ['receiptTemplate'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_template')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Помилка завантаження шаблону чеку:', error);
        return {};
      }
      return data || {};
    },
  });

  useEffect(() => {
    if (open) {
      refetchTemplate();
    }
  }, [open, refetchTemplate]);

  useEffect(() => {
    if (order) {
      setStatus(order.status || 'Новий');
      setPaymentStatus(order.payment_status || 'Борг');
      setShowDeleteConfirm(false);
    }
  }, [order, open]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, newStatus, newPaymentStatus }) => {
      const { data, error } = await supabase
        .from('WorkOrder')
        .update({ 
          status: newStatus, 
          payment_status: newPaymentStatus 
        })
        .eq('id', id)
        .select();
      if (error) throw error;
      return data[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      console.error('Помилка збереження:', error);
      alert(`Не вдалося зберегти зміни: ${error.message}`);
    }
  });

  const handleSave = () => {
    if (!order?.id) return;
    saveMutation.mutate({
      id: order.id,
      newStatus: status,
      newPaymentStatus: paymentStatus,
    });
  };

  // === Генерація HTML чека ===
  const generateReceiptHTML = () => {
    const tpl = receiptTemplate || {};
    const companyName = tpl.company_name || '▲ 1M LAB ▲';
    const subtitle = tpl.subtitle || 'Digital Laboratory';
    const docType = tpl.doc_type || 'НАРЯД-ЧЕК ЛІКАРЯ';
    const warrantyText = tpl.warranty_text || 'ГАРАНТІЯ НА КАРКАС: 5 РОКІВ';
    const thanksText = tpl.thanks_text || 'Дякуємо за довіру до нашої цифрової екосистеми!';
    const contacts = tpl.contacts || 't.me/one_m_lab_bot';
    const showTechnician = tpl.show_technician || false;
    const showTeethData = tpl.show_teeth_data !== undefined ? tpl.show_teeth_data : true;
    const showPaymentStatus = tpl.show_payment_status || false;
    const logoUrl = tpl.logo_url || '';

    const items = getParsedItems();
    const total = order.total_amount || 0;
    const currencySymbol = '₴';
    const creationDate = order.creation_date ? format(new Date(order.creation_date), 'dd.MM.yyyy') : '—';

    const currencyTotals = {};
    if (items.length > 0) {
      items.forEach(item => {
        const currency = item.price_currency || 'UAH';
        const totalItem = item.total || (item.quantity * item.unit_price);
        if (!currencyTotals[currency]) currencyTotals[currency] = 0;
        currencyTotals[currency] += totalItem;
      });
    }

    let itemsRows = '';
    if (items.length > 0) {
      items.forEach(item => {
        const qty = item.quantity || 1;
        const price = item.unit_price || 0;
        const totalItem = item.total || (price * qty);
        const name = item.name || item.service_name || 'Послуга';
        const currency = item.price_currency || 'UAH';
        const symbol = getCurrencySymbol(currency);
        itemsRows += `
          <div class="grid-row">
            <span>${name} (x${qty})</span>
            <span>${totalItem.toFixed(0)} ${symbol}</span>
          </div>
        `;
      });
    } else {
      itemsRows = `<div class="grid-row"><span>Базова робота</span><span>${total.toFixed(0)} ${currencySymbol}</span></div>`;
    }

    let currencySummary = '';
    const currencies = Object.keys(currencyTotals);
    if (currencies.length > 0) {
      currencySummary = currencies.map(curr => {
        const symbol = getCurrencySymbol(curr);
        return `<div class="grid-row" style="font-size: 10px; color: #333;">
          <span>Всього (${curr}):</span>
          <span>${currencyTotals[curr].toFixed(0)} ${symbol}</span>
        </div>`;
      }).join('');
    }

    let techData = '';
    if (showTeethData) {
      if (order.teeth_formula) {
        techData += `<div class="grid-row"><span>Зуби:</span><span class="bold">${order.teeth_formula}</span></div>`;
      }
      if (order.teeth_color) {
        techData += `<div class="grid-row"><span>Колір:</span><span class="bold">${order.teeth_color}</span></div>`;
      }
      if (order.tooth_color) {
        techData += `<div class="grid-row"><span>Колір (Vita):</span><span class="bold">${order.tooth_color}</span></div>`;
      }
    }
    if (!techData) {
      techData = `<div class="grid-row"><span>—</span><span>—</span></div>`;
    }

    const technicianRow = showTechnician && order.technician_name
      ? `<div class="grid-row"><span>Технік:</span><span class="bold">${order.technician_name}</span></div>`
      : '';

    const paymentStatusRow = showPaymentStatus
      ? `<div class="grid-row" style="font-size: 10px; margin-top: 2px; color: #666;">
          <span>Статус оплати:</span>
          <span>${paymentStatus}</span>
        </div>`
      : '';

    const logoHtml = logoUrl 
      ? `<img src="${logoUrl}" style="height: 32px; object-fit: contain; margin-bottom: 2px;" />`
      : `<div class="header-title">${companyName}</div>`;

    return `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Чек-наряд ${order.order_number}</title>
        <style>
          @page { size: 58mm auto; margin: 0; }
          body {
            font-family: 'Courier New', Courier, monospace;
            background-color: #ffffff;
            color: #000000;
            margin: 0;
            padding: 4px;
            width: 58mm;
            font-size: 10px;
            line-height: 1.2;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { text-align: center; margin: 3px 0; letter-spacing: -1px; }
          .header-title { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
          .doc-type {
            font-size: 11px;
            background: #000000;
            color: #ffffff;
            padding: 2px 4px;
            display: inline-block;
            margin: 4px 0;
            font-weight: bold;
          }
          .grid-row { display: flex; justify-content: space-between; margin-bottom: 1px; }
          .total-block { margin-top: 4px; padding: 4px; border: 1px dashed #000000; }
          .currency-summary { margin-top: 3px; padding-top: 3px; border-top: 1px dotted #999; }
          img { max-width: 100%; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="center">
            ${logoHtml}
            <div style="font-size: 7px; text-transform: uppercase;">${subtitle}</div>
            <div class="doc-type">${docType}</div>
            <div class="bold" style="margin-top: 3px;">КЕЙС: #${order.order_number || '—'}</div>
          </div>
          <div class="divider">==========================</div>
          <div class="grid-row"><span>Дата випуску:</span><span class="bold">${creationDate}</span></div>
          <div class="grid-row"><span>Клініка:</span><span class="bold">${order.clinic_name || '—'}</span></div>
          <div class="grid-row"><span>Лікар:</span><span class="bold">${order.doctor_name || '—'}</span></div>
          <div class="grid-row"><span>Пацієнт:</span><span class="bold">${order.patient_name || '—'}</span></div>
          <div class="divider">--------------------------</div>
          <div class="bold" style="margin-bottom: 2px;">ТЕХНІЧНІ ДАНІ:</div>
          ${techData}
          ${technicianRow}
          <div class="divider">--------------------------</div>
          <div class="bold" style="margin-bottom: 2px;">РОЗРАХУНОК:</div>
          ${itemsRows}
          <div class="total-block">
            <div class="grid-row" style="font-size: 12px;">
              <span class="bold">ДО ОПЛАТИ:</span>
              <span class="bold">${total.toFixed(0)} ${currencySymbol}</span>
            </div>
            ${currencies.length > 1 ? `
              <div class="currency-summary">
                ${currencySummary}
              </div>
            ` : ''}
            ${paymentStatusRow}
          </div>
          <div class="divider">==========================</div>
          <div class="center" style="font-size: 8px;">
            <div class="bold">${warrantyText}</div>
            <div style="margin-top: 3px;">${thanksText}</div>
            <div class="bold" style="margin-top: 5px;">${contacts}</div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // === НОВА ФУНКЦІЯ: Нативний скріншот для Fun Print ===
  const handleDirectFunPrint = () => {
    const html = generateReceiptHTML();
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) {
      alert('Будь ласка, дозвольте спливаючі вікна');
      return;
    }
    win.document.write(html);
    win.document.close();

    // Даємо час на завантаження контенту в новому вікні
    setTimeout(() => {
      FunPrint.captureAndPrint()
        .then(() => {
          win.close();
        })
        .catch(err => {
          console.error(err);
          win.close();
          alert('Не вдалося виконати друк');
        });
    }, 1000);
  };

  // === ДРУК через Fun Print ===
  const handleFunPrint = () => {
    const html = generateReceiptHTML();
    const element = document.createElement('div');
    element.innerHTML = html;
    element.style.position = 'fixed';
    element.style.left = '0';
    element.style.top = '0';
    element.style.width = '58mm';
    element.style.background = '#ffffff';
    element.style.padding = '4px';
    element.style.fontSize = '10px';
    element.style.fontFamily = "'Courier New', Courier, monospace";
    element.style.boxSizing = 'border-box';
    element.style.zIndex = '-9999';
    document.body.appendChild(element);

    setTimeout(() => {
      html2canvas(element, {
        scale: 3,
        useCORS: true,
        width: element.scrollWidth,
        height: element.scrollHeight,
        logging: false,
        backgroundColor: '#ffffff',
      }).then((canvas) => {
        const dataUrl = canvas.toDataURL('image/png');

        // Викликаємо наш кастомний плагін для прямого переходу в Fun Print
        FunPrint.printImage({ image: dataUrl })
          .then(() => console.log('Sended to Fun Print'))
          .catch(err => {
            console.error('Fun Print Plugin error:', err);
            // Фолбек на стандартний шарінг якщо плагін не спрацював
            if (navigator.share) {
              fetch(dataUrl)
                .then(res => res.blob())
                .then(blob => {
                  const file = new File([blob], `IMILab_${order.order_number}.png`, { type: 'image/png' });
                  navigator.share({
                    files: [file],
                    title: 'Print Receipt',
                  }).catch(e => console.error('Share error:', e));
                });
            }
          });

        document.body.removeChild(element);
      });
    }, 150);
  };

  // === ДРУК через системний діалог ===
  const handlePrint = () => {
    const html = generateReceiptHTML();
    const win = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');
    if (!win) {
      alert('Будь ласка, дозвольте спливаючі вікна для цього сайту.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
  };

  // === ПОДІЛИТИСЯ (через Web Share API) ===
  const handleShare = async () => {
    const html = generateReceiptHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const file = new File([blob], `Чек-наряд_${order.order_number}.html`, { type: 'text/html' });
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Чек-наряд ${order.order_number}`,
          text: `Чек-наряд ${order.order_number} від ${format(new Date(), 'dd.MM.yyyy')}`,
          files: [file],
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Помилка шарингу:', error);
          await navigator.clipboard.writeText(html);
          alert('HTML-код чека скопійовано в буфер обміну. Вставте його в будь-який додаток.');
        }
      }
    } else {
      const win = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
      } else {
        await navigator.clipboard.writeText(html);
        alert('HTML-код чека скопійовано в буфер обміну.');
      }
    }
  };

  // === ЗАВАНТАЖИТИ ЧЕК (PDF) ===
  const downloadReceipt = () => {
    const html = generateReceiptHTML();
    const element = document.createElement('div');
    element.innerHTML = html;
    element.style.position = 'fixed';
    element.style.left = '0';
    element.style.top = '0';
    element.style.width = '58mm';
    element.style.background = '#ffffff';
    element.style.padding = '4px';
    element.style.fontSize = '10px';
    element.style.fontFamily = "'Courier New', Courier, monospace";
    element.style.boxSizing = 'border-box';
    element.style.zIndex = '-9999';
    document.body.appendChild(element);

    setTimeout(() => {
      html2canvas(element, {
        scale: 2,
        useCORS: true,
        width: element.scrollWidth,
        height: element.scrollHeight,
        logging: false,
        backgroundColor: '#ffffff',
      }).then((canvas) => {
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = 58;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const finalHeight = Math.min(imgHeight, 63);
        
        const pdf = new jsPDF({
          unit: 'mm',
          format: [imgWidth, finalHeight],
          orientation: 'portrait',
        });
        
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, finalHeight);
        pdf.save(`Чек-наряд_${order.order_number}.pdf`);
        document.body.removeChild(element);
      }).catch((err) => {
        console.error('Помилка створення знімку:', err);
        alert('Не вдалося створити PDF. Спробуйте використати друк.');
        document.body.removeChild(element);
      });
    }, 150);
  };

  // === ЗАВАНТАЖИТИ ЧЕК (WORD .doc) ===
  const downloadWord = () => {
    const html = generateReceiptHTML();
    const wordHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" 
            xmlns:w="urn:schemas-microsoft-com:office:word" 
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8">
        <title>Чек-наряд ${order.order_number}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            background-color: #ffffff;
            color: #000000;
            margin: 0;
            padding: 4px;
            width: 58mm;
            font-size: 10px;
            line-height: 1.2;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { text-align: center; margin: 3px 0; letter-spacing: -1px; }
          .header-title { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
          .doc-type {
            font-size: 11px;
            background: #000000;
            color: #ffffff;
            padding: 2px 4px;
            display: inline-block;
            margin: 4px 0;
            font-weight: bold;
          }
          .grid-row { display: flex; justify-content: space-between; margin-bottom: 1px; }
          .total-block { margin-top: 4px; padding: 4px; border: 1px dashed #000000; }
          .currency-summary { margin-top: 3px; padding-top: 3px; border-top: 1px dotted #999; }
          img { max-width: 100%; }
        </style>
      </head>
      <body>
        ${html.replace(/<!DOCTYPE html>.*?<body>/s, '').replace(/<\/body>.*/, '')}
      </body>
      </html>
    `;

    const blob = new Blob([wordHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Чек-наряд_${order.order_number}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // === ЗАВАНТАЖИТИ ЧЕК (EXCEL .xlsx) ===
  const downloadExcel = () => {
    const items = getParsedItems();
    const data = items.map((item, index) => ({
      '№': index + 1,
      'Послуга': item.name || item.service_name || 'Послуга',
      'Кількість': item.quantity || 1,
      'Ціна': item.unit_price || 0,
      'Сума': item.total || (item.quantity * item.unit_price) || 0,
      'Валюта': item.price_currency || 'UAH',
    }));

    const totalSum = data.reduce((acc, row) => acc + row['Сума'], 0);
    data.push({
      '№': '',
      'Послуга': 'ВСЬОГО',
      'Кількість': '',
      'Ціна': '',
      'Сума': totalSum,
      'Валюта': '',
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Чек');
    XLSX.writeFile(wb, `Чек-наряд_${order.order_number}.xlsx`);
  };

  // === ЗАВАНТАЖИТИ ЧЕК (ФОТО PNG) ===
  const downloadImage = () => {
    const html = generateReceiptHTML();
    const element = document.createElement('div');
    element.innerHTML = html;
    element.style.position = 'fixed';
    element.style.left = '0';
    element.style.top = '0';
    element.style.width = '58mm';
    element.style.background = '#ffffff';
    element.style.padding = '4px';
    element.style.fontSize = '10px';
    element.style.fontFamily = "'Courier New', Courier, monospace";
    element.style.boxSizing = 'border-box';
    element.style.zIndex = '-9999';
    document.body.appendChild(element);

    setTimeout(() => {
      // Створюємо картинку
      html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: element.scrollWidth,
        height: element.scrollHeight,
        logging: true,
        backgroundColor: '#ffffff',
      }).then((canvas) => {
        const dataUrl = canvas.toDataURL('image/png');

        // Видаляємо тимчасовий елемент
        if (document.body.contains(element)) {
          document.body.removeChild(element);
        }

        // В мобільному додатку замість скачування викликаємо Share API
        if (navigator.share) {
          fetch(dataUrl)
            .then(res => res.blob())
            .then(blob => {
              const file = new File([blob], `IMILab_${order.order_number}.png`, { type: 'image/png' });
              navigator.share({
                files: [file],
                title: `Наряд ${order.order_number}`,
              }).catch(err => {
                console.error('Share error:', err);
                alert('Не вдалося надіслати фото. Спробуйте використати PDF.');
              });
            });
        } else {
          // Якщо ми в браузері на ПК
          const link = document.createElement('a');
          link.download = `IMILab_${order.order_number}.png`;
          link.href = dataUrl;
          link.click();
        }
      }).catch((err) => {
        console.error('html2canvas error:', err);
        alert('Помилка створення картинки: ' + err.message);
        if (document.body.contains(element)) document.body.removeChild(element);
      });
    }, 200);
  };

  const fallbackDownload = (dataUrl) => {
    const link = document.createElement('a');
    link.download = `Чек-наряд_${order.order_number}.png`;
    link.href = dataUrl;
    link.click();
  };

  const getParsedItems = () => {
    let items = [];
    try {
      if (order.items) {
        items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
      }
    } catch (e) {
      console.error("Помилка парсингу items:", e);
    }
    return items;
  };

  const getCurrencySymbol = (code) => {
    if (code === 'USD') return '$';
    if (code === 'EUR') return '€';
    return '₴';
  };

  const parsedItems = getParsedItems();

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl w-full max-h-[92vh] overflow-y-auto p-0 gap-0">
        <div className="sr-only">
          <DialogTitle>Наряд {order.order_number}</DialogTitle>
          <DialogDescription>Деталі наряду, статус виробництва та оплати</DialogDescription>
        </div>

        <DialogHeader className="p-4 md:p-6 pb-4 border-b bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold flex flex-wrap items-center gap-2">
              Наряд {order.order_number}
              <StatusBadge status={status} />
            </DialogTitle>
            <DialogDescription className="text-xs mt-0.5">
              Створено: {order.creation_date ? format(new Date(order.creation_date), 'dd MMMM yyyy', { locale: uk }) : '—'}
            </DialogDescription>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Головна кнопка для Fun Print */}
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 hover:text-orange-700 animate-pulse flex items-center gap-2"
                onClick={handleDirectFunPrint}
              >
                <Printer className="w-4 h-4 stroke-[2.5px]" />
                <span className="text-[10px] font-bold uppercase tracking-tight">Друк JPG</span>
              </Button>

              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-blue-500 hover:bg-blue-50"
                  onClick={handleFunPrint}
                  title="Друк через меню"
                >
                  <Printer className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-emerald-500 hover:bg-emerald-50"
                  onClick={handleShare}
                  title="Поділитися"
                >
                  <Share2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-amber-500 hover:bg-amber-50"
                  onClick={downloadReceipt}
                  title="PDF"
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-pink-500 hover:bg-pink-50"
                  onClick={downloadImage}
                  title="Фото"
                >
                  <Image className="w-4 h-4" />
                </Button>
              </div>

              {!showDeleteConfirm ? (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-red-400 hover:text-red-600"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              ) : (

                <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                  <Button size="sm" variant="destructive" className="h-7 px-2 text-[10px]" onClick={() => { onDelete?.(order.id); setShowDeleteConfirm(false); }}>Видалити</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] bg-white" onClick={() => setShowDeleteConfirm(false)}>Скасувати</Button>
                </div>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2.5 rounded-lg border">
                <UserRound className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Пацієнт</p>
                  <p className="font-semibold">{order.patient_name || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2.5 rounded-lg border">
                <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Клініка та Лікар</p>
                  <p className="font-semibold">{order.clinic_name || '—'} {order.doctor_name ? `(${order.doctor_name})` : ''}</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2.5 rounded-lg border">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Дата Здачі (Дедлайн)</p>
                  <p className="font-semibold text-amber-600">
                    {order.due_date ? format(new Date(order.due_date), 'dd MMMM yyyy (EEEE)', { locale: uk }) : 'Не вказано'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2.5 rounded-lg border">
                <Wrench className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Головний технік</p>
                  <p className="font-semibold">{order.technician_name || 'Не призначено'}</p>
                </div>
              </div>
            </div>
          </div>

          {(order.teeth_formula || order.teeth_color || order.tooth_color) && (
            <div className="bg-slate-50 border rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {order.teeth_formula && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Зубна формула:</span>
                  <div className="font-mono text-xs font-bold bg-white px-2.5 py-1.5 rounded border text-blue-600 inline-block">
                    {order.teeth_formula}
                  </div>
                </div>
              )}
              {(order.teeth_color || order.tooth_color) && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Колір зуба:</span>
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-800">
                    <Palette className="w-4 h-4 text-amber-500" />
                    <span>{order.teeth_color || order.tooth_color}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {parsedItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Перелік виконаних робіт:</h4>
              <div className="border rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b font-semibold text-slate-600">
                      <th className="p-2.5">Робота</th>
                      <th className="p-2.5 text-center">К-сть</th>
                      <th className="p-2.5 text-right">Ціна</th>
                      <th className="p-2.5 text-right">Сума</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-medium">{item.name || item.service_name || 'Послуга'}</td>
                        <td className="p-2.5 text-center font-mono">{item.quantity || 1}</td>
                        <td className="p-2.5 text-right font-mono text-slate-500">
                          {(item.unit_price || 0)?.toFixed(0)} {getCurrencySymbol(item.price_currency)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          {(item.total || (item.quantity * item.unit_price))?.toFixed(0)} {getCurrencySymbol(item.price_currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 border-t">
            <Select value={status} onValueChange={setStatus} disabled={saveMutation.isPending}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={paymentStatus} onValueChange={setPaymentStatus} disabled={saveMutation.isPending}>
              <SelectTrigger className={`flex-1 ${PAYMENT_STATUS_STYLES[paymentStatus] || 'bg-muted'}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Оплачено">✅ Оплачено</SelectItem>
                <SelectItem value="Частково">🟡 Частково</SelectItem>
                <SelectItem value="Борг">🔴 Борг</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Збереження...' : 'Зберегти зміни'}
            </Button>

            {isAdmin && onEdit && (
              <Button variant="outline" onClick={() => { onClose(); onEdit(order); }}>
                Редагувати
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
