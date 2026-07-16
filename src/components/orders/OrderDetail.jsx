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
  Printer, Share2, Image as ImageIcon, Coins, QrCode, X, FileText
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { QRCodeCanvas } from 'qrcode.react';
import { registerPlugin } from '@capacitor/core';
import { fetchExchangeRates } from '@/api/currencyService.js';

const FunPrint = registerPlugin('FunPrint');

const UPPER_LEFT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_RIGHT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_RIGHT = [31, 32, 33, 34, 35, 36, 37, 38];

const getToothImage = (num) => {
  try {
    return new URL(`../../assets/teeth/${num}.png`, import.meta.url).href;
  } catch (e) {
    return null;
  }
};

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
  const [printCurrency, setPrintCurrency] = useState('UAH');

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

  const { data: invoiceTemplate } = useQuery({
    queryKey: ['invoiceTemplate'],
    queryFn: async () => {
      const { data } = await supabase.from('InvoiceTemplate').select('*').maybeSingle();
      return data || {};
    },
  });

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

  const generateReceiptHTML = (targetCurrency = 'UAH') => {
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

    // Рендер головної суми
    let mainTotalHtml = '';
    if (targetCurrency === 'ORIGINAL') {
        const activeCurrencies = Object.entries(totals).filter(([_, v]) => v > 0);
        if (activeCurrencies.length === 0) {
            mainTotalHtml = `0 ${getCurrencySymbol('UAH')}`;
        } else {
            mainTotalHtml = activeCurrencies
                .map(([cur, val]) => `${val.toFixed(cur === 'UAH' ? 0 : 2)} ${getCurrencySymbol(cur)}`)
                .join(' + ');
        }
    } else {
        let mainTotal = totals.UAH;
        if (targetCurrency === 'USD') {
            mainTotal = (totals.UAH / exchangeRates.USD) + totals.USD + (totals.EUR * exchangeRates.EUR / exchangeRates.USD);
        } else if (targetCurrency === 'EUR') {
            mainTotal = (totals.UAH / exchangeRates.EUR) + (totals.USD * exchangeRates.USD / exchangeRates.EUR) + totals.EUR;
        } else {
            mainTotal = totals.UAH + (totals.USD * exchangeRates.USD) + (totals.EUR * exchangeRates.EUR);
        }
        mainTotalHtml = `${mainTotal.toFixed(targetCurrency === 'UAH' ? 0 : 2)} ${getCurrencySymbol(targetCurrency)}`;
    }

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
            <span style="font-weight:900; font-size:13px; text-align:right; flex:1; padding-left:10px;">${mainTotalHtml}</span>
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

          <div style="margin-top:15px; display:flex; flex-direction:column; align-items:center;">
             <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https://imi-lab4.vercel.app/p/order/${order.id}" style="width:30mm; height:30mm; margin-bottom:5px;" />
             <div style="font-size:7px; color:#666; font-family:monospace;">SCAN TO VIEW DIGITAL CASE</div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handleDownloadA4Pdf = () => {
    const tpl = invoiceTemplate || {};
    const qrUrl = `https://imi-lab4.vercel.app/p/order/${order.id}`;
    const items = getParsedItems();
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

    const totals = { UAH: 0, USD: 0, EUR: 0 };
    items.forEach(item => {
      const cur = item.price_currency || 'UAH';
      if (totals[cur] !== undefined) {
        totals[cur] += parseFloat(item.unit_price || 0) * (parseInt(item.quantity) || 1);
      }
    });

    const discountPercent = parseFloat(order.manual_discount_percent) || parseFloat(order.doctor_discount) || 0;
    const finalTotals = {};
    Object.entries(totals).forEach(([cur, val]) => {
      if (val > 0) finalTotals[cur] = val * (1 - discountPercent / 100);
    });

    const totalInUah = Object.entries(finalTotals).reduce((acc, [cur, val]) => {
      if (cur === 'UAH') return acc + val;
      return acc + (val * exchangeRates[cur]);
    }, 0);

    const renderTooth = (num) => {
      const isSelected = selectedTeeth.includes(num);
      const imageSrc = getToothImage(num);
      const toothShade = shades[num];
      return `
        <div style="display: flex; flex-direction: column; align-items: center; min-width: 35px;">
          <span style="font-size: 9px; font-weight: 900; margin-bottom: 2px; color: ${isSelected ? '#2563eb' : '#cbd5e1'}">${num}</span>
          <div style="position: relative; width: 32px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid ${isSelected ? '#dbeafe' : 'transparent'}; background: ${isSelected ? '#eff6ff' : 'transparent'}">
            <img src="${imageSrc}" style="width: 100%; height: 100%; object-fit: contain; ${isSelected ? '' : 'opacity: 0.2; filter: grayscale(100%);'}" />
            ${isSelected && toothShade ? `<div style="position: absolute; bottom: -4px; right: -4px; background: #2563eb; color: white; font-size: 7px; font-weight: 900; padding: 1px 3px; border-radius: 3px; z-index: 10;">${toothShade.neck || toothShade.incisal}</div>` : ''}
          </div>
        </div>
      `;
    };

    const html = `
      <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 210mm; padding: 10mm; background: white; color: #1e293b;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px;">
          <div>
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
              <span style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #2563eb; background: #eff6ff; padding: 2px 8px; border-radius: 20px;">Наряд №${order.order_number}</span>
              <span style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #94a3b8;">Work Sheet</span>
            </div>
            <h1 style="font-size: 24pt; font-weight: 900; margin: 0; color: #0f172a;">${order.patient_name || '—'}</h1>
          </div>
          <div style="text-align: right;">
            ${tpl.logo_url ? `<img src="${tpl.logo_url}" style="max-height: 15mm; margin-bottom: 5px;" />` : `<div style="width: 12mm; height: 12mm; background: #0f172a; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 8px; margin-left: auto;">LAB</div>`}
            <div style="font-size: 10pt; font-weight: 700; color: #64748b;">IMILab System</div>
          </div>
        </div>

        <!-- Info Cards -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div style="background: #f8fafc; border-radius: 20px; padding: 15px; border: 1px solid #f1f5f9;">
            <div style="margin-bottom: 12px;">
              <p style="font-size: 8pt; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">Клініка</p>
              <p style="font-size: 12pt; font-weight: 700; color: #1e293b; margin: 0;">${order.clinic_name || 'Приватна практика'}</p>
            </div>
            <div style="border-top: 1px solid #e2e8f0; padding-top: 10px;">
              <p style="font-size: 8pt; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">Лікар</p>
              <p style="font-size: 12pt; font-weight: 700; color: #1e293b; margin: 0;">${order.doctor_name || '—'}</p>
            </div>
          </div>
          <div style="background: #f8fafc; border-radius: 20px; padding: 15px; border: 1px solid #f1f5f9; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <p style="font-size: 8pt; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">Поступлення</p>
              <p style="font-size: 11pt; font-weight: 700; color: #1e293b; margin: 0;">${order.creation_date ? format(parseISO(order.creation_date), 'dd.MM.yyyy') : '—'}</p>
            </div>
            <div style="text-align: right;">
              <p style="font-size: 8pt; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">План здачі</p>
              <p style="font-size: 11pt; font-weight: 900; color: #2563eb; margin: 0;">${order.due_date ? format(parseISO(order.due_date), 'dd.MM.yyyy') : '—'}</p>
            </div>
            <div style="grid-column: span 2; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 5px;">
               <p style="font-size: 8pt; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">Комплектація</p>
               <div style="font-size: 9pt; color: #475569; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                 <span>Ложки: <b>${order.trays_count || 0}</b></span>
                 <span>Трансфери: <b>${order.transfers_count || 0}</b></span>
                 <span>Аналоги: <b>${order.analogs_count || 0}</b></span>
                 <span>Абатменти: <b>${order.abutments_count || 0}</b></span>
               </div>
            </div>
          </div>
        </div>

        <!-- Tooth Chart -->
        <div style="background: white; border-radius: 25px; border: 1px solid #f1f5f9; margin-bottom: 20px; overflow: hidden;">
          <div style="background: #f8fafc; padding: 8px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between;">
            <span style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #64748b;">Зубна карта (FDI)</span>
            <div style="display: flex; gap: 20px;">
              <span style="font-size: 8pt; font-weight: 900; color: #2563eb;">R</span>
              <span style="font-size: 8pt; font-weight: 900; color: #2563eb;">L</span>
            </div>
          </div>
          <div style="padding: 15px; display: flex; flex-direction: column; gap: 10px; align-items: center;">
            <div style="display: flex; gap: 4px;">
              <div style="display: flex; gap: 2px;">${UPPER_LEFT.map(n => renderTooth(n)).join('')}</div>
              <div style="width: 1px; height: 40px; background: #f1f5f9; margin: 0 5px;"></div>
              <div style="display: flex; gap: 2px;">${UPPER_RIGHT.map(n => renderTooth(n)).join('')}</div>
            </div>
            <div style="display: flex; gap: 4px;">
              <div style="display: flex; gap: 2px;">${LOWER_LEFT.map(n => renderTooth(n)).join('')}</div>
              <div style="width: 1px; height: 40px; background: #f1f5f9; margin: 0 5px;"></div>
              <div style="display: flex; gap: 2px;">${LOWER_RIGHT.map(n => renderTooth(n)).join('')}</div>
            </div>
          </div>
        </div>

        <!-- Services -->
        <div style="background: white; border-radius: 20px; border: 1px solid #f1f5f9; margin-bottom: 20px; overflow: hidden;">
          <div style="background: #0f172a; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #94a3b8;">Перелік послуг</span>
            <span style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: white; background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 5px;">${items.length} поз.</span>
          </div>
          <div style="padding: 0;">
            ${items.map((item, idx) => `
              <div style="padding: 10px 20px; border-bottom: 1px solid #f8fafc; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <p style="font-size: 10.5pt; font-weight: 700; color: #1e293b; margin: 0;">${item.service_name || item.name}</p>
                  <p style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #2563eb; margin: 2px 0 0 0;">
                    ${item.teeth_numbers ? `Зуби: ${item.teeth_numbers}` : 'Загальна робота'} • x${item.quantity || 1}
                  </p>
                </div>
                <div style="text-align: right;">
                  <p style="font-size: 11pt; font-weight: 900; color: #0f172a; margin: 0;">${(item.unit_price * (item.quantity || 1)).toLocaleString()} ${getCurrencySymbol(item.price_currency)}</p>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Totals -->
          <div style="background: #0f172a; padding: 20px; color: white;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #64748b;">Розрахунок</span>
              <span style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #10b981; border: 1px solid rgba(16,185,129,0.2); padding: 2px 8px; border-radius: 20px;">${order.payment_status || 'Очікує'}</span>
            </div>
            ${Object.entries(finalTotals).map(([cur, val]) => `
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="font-size: 9pt; font-weight: 700; color: #64748b; text-transform: uppercase;">${cur}</span>
                <span style="font-size: 14pt; font-weight: 900;">${Math.round(val).toLocaleString()} ${getCurrencySymbol(cur)}</span>
              </div>
            `).join('')}
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-size: 9pt; font-weight: 900; text-transform: uppercase; color: #3b82f6;">Разом до сплати:</span>
              <div>
                <span style="font-size: 28pt; font-weight: 900; letter-spacing: -1px;">${Math.round(totalInUah).toLocaleString()}</span>
                <span style="font-size: 12pt; font-weight: 900; color: #3b82f6; margin-left: 4px;">ГРН</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Technical Specs & Notes -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div style="background: white; border-radius: 20px; border: 1px solid #f1f5f9; padding: 15px;">
            <h3 style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin: 0 0 10px 0;">Технічні специфікації</h3>
            <div style="font-size: 9pt;">
              ${Object.entries(shades).map(([tooth, s]) => `
                <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f8fafc;">
                  <span style="font-weight: 900; color: #2563eb;">Зуб ${tooth}</span>
                  <span style="font-weight: 700; color: #475569;">${s.neck ? `Ш: ${s.neck}` : ''} ${s.incisal ? ` | К: ${s.incisal}` : ''}</span>
                </div>
              `).join('')}
              ${Object.keys(shades).length === 0 ? '<p style="color: #94a3b8; font-style: italic;">Окремі кольори не вказані</p>' : ''}
            </div>
            <div style="margin-top: 15px; display: flex; gap: 10px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
               <div style="display: flex; align-items: center; gap: 4px; font-size: 8pt; font-weight: 800; color: #64748b; text-transform: uppercase;">
                 <div style="width: 10px; height: 10px; border: 2px solid #e2e8f0; border-radius: 3px; ${order.trial_type === 'frame' ? 'background: #2563eb; border-color: #2563eb;' : ''}"></div> Каркас
               </div>
               <div style="display: flex; align-items: center; gap: 4px; font-size: 8pt; font-weight: 800; color: #64748b; text-transform: uppercase;">
                 <div style="width: 10px; height: 10px; border: 2px solid #e2e8f0; border-radius: 3px; ${order.trial_type === 'bisque' ? 'background: #2563eb; border-color: #2563eb;' : ''}"></div> Бісквіт
               </div>
               <div style="display: flex; align-items: center; gap: 4px; font-size: 8pt; font-weight: 800; color: #64748b; text-transform: uppercase;">
                 <div style="width: 10px; height: 10px; border: 2px solid #e2e8f0; border-radius: 3px; ${order.trial_type === 'final' ? 'background: #2563eb; border-color: #2563eb;' : ''}"></div> Фініш
               </div>
            </div>
          </div>
          <div style="background: #fffbeb; border-radius: 20px; border: 1px solid #fef3c7; padding: 15px;">
            <h3 style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #b45309; margin: 0 0 10px 0;">Коментарі до замовлення</h3>
            <p style="font-size: 10pt; color: #92400e; font-weight: 500; font-style: italic; line-height: 1.4; margin: 0;">
              ${order.notes || 'Додаткові вказівки відсутні'}
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <div style="padding: 10px; background: white; border: 1px solid #f1f5f9; border-radius: 15px;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrUrl)}" style="width: 20mm; height: 20mm;" />
            </div>
            <div>
              <p style="font-size: 8pt; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase;">Цифрова лабораторія IMILab</p>
              <p style="font-size: 7pt; font-weight: 700; color: #94a3b8; margin: 2px 0 0 0;">${(tpl.company_address || '').split('•')[0].trim()}</p>
            </div>
          </div>
          <div style="text-align: right; opacity: 0.3;">
            <p style="font-size: 7pt; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px;">Digital Case Workflow v4.0</p>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.width = '210mm';
    container.innerHTML = html;
    document.body.appendChild(container);

    setTimeout(() => {
      html2canvas(container, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      }).then(canvas => {
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        document.body.removeChild(container);

        const pdf = new jsPDF('p', 'mm', 'a4');
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);

        if (window.Capacitor && FunPrint) {
           const pdfBase64 = pdf.output('datauristring');
           FunPrint.savePdfToFile({ data: pdfBase64, filename: `WorkOrder_${order.order_number}_A4.pdf` })
              .then(() => alert('✅ PDF для роботи збережено!'))
              .catch(err => alert('Помилка збереження PDF: ' + err.message));
        } else {
           pdf.save(`WorkOrder_${order.order_number}_A4.pdf`);
        }
      }).catch(err => {
        document.body.removeChild(container);
        alert('Помилка генерації PDF: ' + err.message);
      });
    }, 1500);
  };

  const handlePrintReceipt = async () => {
    try {
      const html = generateReceiptHTML(printCurrency);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '58mm';
      iframe.style.height = '1px';
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
          body.style.margin = '0';
          body.style.padding = '0';
          body.style.display = 'inline-block';

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
            await FunPrint.printImage({ image: imgData });
          } else {
            const win = window.open('', '_blank');
            win.document.write(`<img src="${imgData}" style="width:100%" />`);
            win.document.close();
            win.focus();
            setTimeout(() => { win.print(); win.close(); }, 250);
          }
        } catch (err) {
          console.error(err);
          alert('Помилка друку: ' + err.message);
        }
      }, 1200);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleSaveReceiptAsImage = async () => {
    try {
      const html = generateReceiptHTML(printCurrency);
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
            <Select value={printCurrency} onValueChange={setPrintCurrency}>
              <SelectTrigger className="w-24 h-9 rounded-full bg-slate-50 border-slate-200 text-[10px] font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="ORIGINAL">Оригінал</SelectItem>
                <SelectItem value="UAH">UAH ₴</SelectItem>
                <SelectItem value="USD">USD $</SelectItem>
                <SelectItem value="EUR">EUR €</SelectItem>
              </SelectContent>
            </Select>
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-slate-100" onClick={handlePrintReceipt} title="Надрукувати чек (Термопринтер)"><Printer className="w-4 h-4 text-emerald-600" /></Button>
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-slate-100" onClick={handleSaveReceiptAsImage} title="Зберегти чек як фото"><ImageIcon className="w-4 h-4 text-blue-600" /></Button>
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-slate-100" onClick={() => setQrOpen(true)} title="Показати QR-код наряду"><QrCode className="w-4 h-4 text-slate-600" /></Button>
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-slate-100" onClick={handleDownloadA4Pdf} title="Роздрукувати наряд (A4 PDF)"><FileText className="w-4 h-4 text-blue-600" /></Button>
            <div className="w-px h-6 bg-slate-200 mx-1" />
            <Button size="icon" variant="ghost" className="rounded-full hover:bg-red-50 hover:text-red-500" onClose={onClose} onClick={onClose} title="Закрити"><X className="w-5 h-5" /></Button>
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
