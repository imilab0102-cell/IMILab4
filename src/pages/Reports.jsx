import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient'; 
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Calendar, Building2, UserRound, FileSpreadsheet, FileText, X, 
  TrendingUp, Wallet, AlertCircle, RefreshCw, ArrowLeftRight, 
  Copy, Printer, Download, FileCheck, Share2, Image as ImageIcon, Coins
} from 'lucide-react';
import { format, getMonth, getYear, parseISO, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { uk } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { registerPlugin } from '@capacitor/core';
import { fetchExchangeRates } from '@/api/currencyService.js';

const FunPrint = registerPlugin('FunPrint');

const MONTHS = [
  { value: '0', label: 'Січень' }, { value: '1', label: 'Лютий' },
  { value: '2', label: 'Березень' }, { value: '3', label: 'Квітень' },
  { value: '4', label: 'Травень' }, { value: '5', label: 'Червень' },
  { value: '6', label: 'Липень' }, { value: '7', label: 'Серпень' },
  { value: '8', label: 'Вересень' }, { value: '9', label: 'Жовтень' },
  { value: '10', label: 'Листопад' }, { value: '11', label: 'Грудень' }
];

const YEARS = [2024, 2025, 2026, 2027];

export default function Reports() {
  const [filterMode, setFilterMode] = useState('month');
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth()));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedClinic, setSelectedClinic] = useState('_all');
  const [selectedDoctor, setSelectedDoctor] = useState('_all');
  const [reportCurrency, setReportCurrency] = useState('UAH');
  const [activeTab, setActiveTab] = useState('table');
  const [exchangeRates, setExchangeRates] = useState({ USD: 41.5, EUR: 44.5 });
  const [isRateLoading, setIsRateLoading] = useState(false);
  const [calcAmount, setCalcAmount] = useState('100');
  const [calcFrom, setCalcFrom] = useState('USD');
  const [calcTo, setCalcTo] = useState('UAH');

  const handleClinicChange = (id) => {
    setSelectedClinic(id);
    setSelectedDoctor('_all');
  };

  const handleDoctorChange = (val) => {
    setSelectedDoctor(val);
  };

  const { data: rawOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['reports-orders-v200'],
    queryFn: async () => {
      const { data, error } = await supabase.from('WorkOrder').select('*').order('creation_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: templateData } = useQuery({
    queryKey: ['invoiceTemplate'],
    queryFn: async () => {
      const { data } = await supabase.from('InvoiceTemplate').select('*').maybeSingle();
      return data || {};
    },
  });

  useEffect(() => {
    const loadRates = async () => {
      setIsRateLoading(true);
      try {
        const rates = await fetchExchangeRates();
        if (rates && rates.USD > 10) {
          setExchangeRates({ USD: rates.USD, EUR: rates.EUR });
        }
      } catch (e) {
        console.warn('Currency fetch failed, using defaults');
      } finally {
        setIsRateLoading(false);
      }
    };
    loadRates();
  }, []);

  const convertVal = (val, from, to) => {
    const v = parseFloat(val) || 0;
    if (!to || to === 'ORIGINAL' || from === to) return v;
    const usd = exchangeRates.USD || 41.5;
    const eur = exchangeRates.EUR || 44.5;
    let inUah = from === 'UAH' ? v : v * (from === 'USD' ? usd : eur);
    if (to === 'UAH') return inUah;
    return to === 'USD' ? inUah / usd : inUah / eur;
  };

  const getOrderTotals = (o) => {
    if (!o) return { UAH: 0, USD: 0, EUR: 0 };
    let items = [];
    try { items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch(e) { items = []; }
    const totals = { UAH: 0, USD: 0, EUR: 0 };
    if (items.length === 0) {
      totals.UAH = parseFloat(o.total_amount || 0);
    } else {
      items.forEach(i => {
        if (i && i.total) {
          const cur = i.price_currency || 'UAH';
          if (totals[cur] !== undefined) totals[cur] += parseFloat(i.total);
        }
      });
    }
    const disc = parseFloat(o.manual_discount_percent || o.doctor_discount || 0);
    if (disc > 0 && disc < 100) {
      const f = 1 - (disc / 100);
      totals.UAH *= f; totals.USD *= f; totals.EUR *= f;
    }
    return totals;
  };

  const getOrderTotalInCurrency = (o, targetCurr) => {
    const t = getOrderTotals(o);
    if (targetCurr === 'ORIGINAL') return parseFloat(o.total_amount || 0);
    return convertVal(t.UAH, 'UAH', targetCurr) + convertVal(t.USD, 'USD', targetCurr) + convertVal(t.EUR, 'EUR', targetCurr);
  };

  const orders = useMemo(() => Array.isArray(rawOrders) ? rawOrders : [], [rawOrders]);

  const filterOptions = useMemo(() => {
    const clinicsMap = new Map();
    const doctorsSet = new Set();
    orders.forEach(o => {
      if (!o) return;
      const cId = o.clinic_id?.toString() || 'none';
      const cName = o.clinic_name || 'Приватна практика';
      clinicsMap.set(cId, cName);
      if (o.doctor_name && (selectedClinic === '_all' || cId === selectedClinic)) {
        doctorsSet.add(o.doctor_name);
      }
    });
    return {
      clinics: Array.from(clinicsMap.entries()).map(([id, name]) => ({ id, name })),
      doctors: Array.from(doctorsSet).sort()
    };
  }, [orders, selectedClinic]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (!o?.creation_date) return false;
      try {
        const d = parseISO(o.creation_date);
        if (filterMode === 'period') {
          if (dateFrom && dateTo) {
            const start = parseISO(dateFrom); const end = parseISO(dateTo);
            if (!isWithinInterval(d, { start, end })) return false;
          }
        } else {
          if (getMonth(d) !== parseInt(selectedMonth) || getYear(d) !== parseInt(selectedYear)) return false;
        }
        const cId = o.clinic_id?.toString() || 'none';
        if (selectedClinic !== '_all' && cId !== selectedClinic) return false;
        if (selectedDoctor !== '_all' && o.doctor_name !== selectedDoctor) return false;
        return true;
      } catch (e) { return false; }
    });
  }, [orders, filterMode, dateFrom, dateTo, selectedMonth, selectedYear, selectedClinic, selectedDoctor]);

  const activeOrders = useMemo(() => filteredOrders.filter(o => o && o.status && String(o.status).toLowerCase().trim() !== 'скасовано'), [filteredOrders]);

  const financeTotals = useMemo(() => {
    const totals = { work: { UAH: 0, USD: 0, EUR: 0 }, paid: { UAH: 0, USD: 0, EUR: 0 }, debt: { UAH: 0, USD: 0, EUR: 0 } };
    activeOrders.forEach(o => {
      const t = getOrderTotals(o);
      const isPaid = (o.payment_status || '').toLowerCase().includes('оплачено') || (o.payment_status || '').toLowerCase().includes('paid');
      const paidGrn = parseFloat(o.paid_amount || 0);
      ['UAH', 'USD', 'EUR'].forEach(c => {
        totals.work[c] += t[c];
        if (isPaid) totals.paid[c] += t[c];
        else if (c === 'UAH') totals.paid.UAH += Math.min(t.UAH, paidGrn);
      });
    });
    ['UAH', 'USD', 'EUR'].forEach(c => { totals.debt[c] = Math.max(0, totals.work[c] - totals.paid[c]); });
    return totals;
  }, [activeOrders]);

  const displayTotals = useMemo(() => {
    if (reportCurrency === 'ORIGINAL') return financeTotals;
    const res = { work: { [reportCurrency]: 0 }, paid: { [reportCurrency]: 0 }, debt: { [reportCurrency]: 0 } };
    ['UAH', 'USD', 'EUR'].forEach(c => {
      res.work[reportCurrency] += convertVal(financeTotals.work[c], c, reportCurrency);
      res.paid[reportCurrency] += convertVal(financeTotals.paid[c], c, reportCurrency);
      res.debt[reportCurrency] += convertVal(financeTotals.debt[c], c, reportCurrency);
    });
    return res;
  }, [financeTotals, reportCurrency, exchangeRates]);

  const totalTechPay = useMemo(() => {
    const raw = activeOrders.reduce((sum, o) => {
      let items = []; try { items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch(e) {}
      const fromItems = items.reduce((s, i) => s + (parseFloat(i.technician_price || i.technician_pay || 0) * (parseInt(i.quantity) || 1)), 0);
      return sum + (fromItems > 0 ? fromItems : (parseFloat(o?.technician_total_pay) || 0));
    }, 0);
    return convertVal(raw, 'UAH', reportCurrency === 'ORIGINAL' ? 'UAH' : reportCurrency);
  }, [activeOrders, reportCurrency, exchangeRates]);

  const netProfit = useMemo(() => {
    const raw = activeOrders.reduce((sum, o) => {
      const uah = getOrderTotalInCurrency(o, 'UAH');
      let items = []; try { items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch(e) {}
      const tech = items.reduce((s, i) => s + (parseFloat(i.technician_price || i.technician_pay || 0) * (parseInt(i.quantity) || 1)), 0);
      const tp = tech > 0 ? tech : (parseFloat(o?.technician_total_pay) || 0);
      return sum + (uah - tp - parseFloat(o.expenses || 0));
    }, 0);
    return convertVal(raw, 'UAH', reportCurrency === 'ORIGINAL' ? 'UAH' : reportCurrency);
  }, [activeOrders, reportCurrency, exchangeRates]);

  const calcResultValue = useMemo(() => convertVal(calcAmount, calcFrom, calcTo), [calcAmount, calcFrom, calcTo, exchangeRates]);

  const renderCur = (obj, cls = "") => {
    const act = Object.entries(obj).filter(([_, v]) => v > 0);
    if (act.length === 0) return <span className={cls}>0 ₴</span>;
    return <div className="flex flex-col text-right">{act.map(([c, v]) => <span key={c} className={`font-black ${cls}`}>{v.toLocaleString('uk-UA', { maxFractionDigits: 0 })} {c==='UAH'?'₴':c==='USD'?'$':'€'}</span>)}</div>;
  };

  const handleExcel = () => {
    const curr = reportCurrency === 'ORIGINAL' ? 'UAH' : reportCurrency;
    const data = activeOrders.map((o, idx) => ({
      '№': idx + 1,
      'Дата': o.creation_date,
      'Клініка': o.clinic_name,
      'Лікар': o.doctor_name,
      'Пацієнт': o.patient_name,
      [`Сума (${curr})`]: getOrderTotalInCurrency(o, curr).toFixed(2),
      'Статус': o.payment_status
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Звіт");
    XLSX.writeFile(wb, `Report_IMILab_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
  };

  const handleNativeShare = async (type) => {
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');

      const t = templateData || {};
      const dr = selectedDoctor !== '_all' ? selectedDoctor : 'Всі лікарі';
      const cl = selectedClinic !== '_all' ? (filterOptions.clinics.find(c => c.id === selectedClinic)?.name || 'Клініка') : 'Всі клініки';
      const period = filterMode === 'month'
        ? `${MONTHS[parseInt(selectedMonth)].label} ${selectedYear}`
        : `${format(parseISO(dateFrom), 'dd.MM.yyyy')} - ${format(parseISO(dateTo), 'dd.MM.yyyy')}`;

      const rows = activeOrders.map(o => {
        const totals = getOrderTotals(o);
        const amountStr = Object.entries(totals)
          .filter(([_, v]) => v > 0)
          .map(([c, v]) => `${v.toFixed(0)}${c==='UAH'?'₴':c==='USD'?'$':'€'}`)
          .join(' + ') || '0₴';

        const rawStatus = (o.payment_status || 'Борг').trim();
        let statusColor = '#ef4444'; // Red for Borh
        let statusLabel = 'БОРГ';

        if (rawStatus.toLowerCase().includes('оплачено') || rawStatus.toLowerCase().includes('paid')) {
          statusColor = '#10b981'; // Green
          statusLabel = 'ОПЛАЧЕНО';
        } else if (rawStatus.toLowerCase().includes('частково') || rawStatus.toLowerCase().includes('partial')) {
          statusColor = '#f59e0b'; // Amber
          statusLabel = 'ЧАСТКОВО';
        }

        return `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-size: 10px; white-space: nowrap;">
              <div style="font-weight: bold;">${format(parseISO(o.creation_date), 'dd.MM.yyyy')}</div>
              <div style="font-size: 8px; color: #64748b; margin-top: 2px; text-transform: uppercase; font-weight: bold;">${o.status || '—'}</div>
            </td>
            <td style="padding: 10px; font-size: 11px;">
              <div style="font-weight: bold; color: #1e293b;">${o.patient_name}</div>
              <div style="font-size: 9px; color: #64748b;">${o.clinic_name}</div>
            </td>
            <td style="padding: 10px; text-align: center;">
              <div style="display: inline-block; min-width: 65px; font-size: 8px; font-weight: 900; color: white; background: ${statusColor}; padding: 3px 6px; border-radius: 4px; text-align: center; letter-spacing: 0.5px;">
                ${statusLabel}
              </div>
            </td>
            <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 11px; white-space: nowrap; color: #1e293b;">
              ${amountStr}
            </td>
          </tr>
        `;
      }).join('');

      const renderSummaryRow = (label, data, color) => {
        const currencies = Object.entries(data).filter(([_, v]) => v > 0);
        if (currencies.length === 0) return '';
        return `
          <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #e2e8f0;">
            <span style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">${label}:</span>
            <div style="text-align: right; color: ${color || '#1e293b'}; font-weight: 900; font-size: 13px;">
              ${currencies.map(([c, v]) => `<div>${v.toLocaleString()} ${c==='UAH'?'₴':c==='USD'?'$':'€'}</div>`).join('')}
            </div>
          </div>
        `;
      };

      const contentHtml = `
        <div style="font-family: sans-serif; padding: 40px; background: white; width: 750px; color: #1e293b;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 30px; border-bottom: 3px solid ${t.header_color || '#3b82f6'}; padding-bottom: 20px;">
            <div>
              ${t.logo_url ? `<img src="${t.logo_url}" style="height: 60px; margin-bottom: 10px; object-fit: contain;" />` : ''}
              <h1 style="margin: 0; font-size: 24px; color: ${t.header_color || '#3b82f6'}; text-transform: uppercase;">${t.company_name || 'IMI.LAB'}</h1>
              <div style="font-size: 11px; color: #64748b; margin-top: 5px;">
                ${t.company_address ? `<div>${t.company_address.split('•')[0].trim()}</div>` : ''}
                ${t.company_email ? `<div>Email: ${t.company_email}</div>` : ''}
                ${t.show_company_code && t.company_code ? `<div>Код: ${t.company_code}</div>` : ''}
              </div>
            </div>
            <div style="text-align: right;">
              <h2 style="margin: 0; font-size: 18px; color: #64748b;">${t.invoice_title || 'ЗВІТ ПО РОБОТАХ'}</h2>
              <div style="margin-top: 10px;">
                <div style="font-weight: bold; font-size: 14px;">${dr}</div>
                <div style="font-size: 12px; color: #64748b;">${cl}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 5px;">Період: ${period}</div>
              </div>
            </div>
          </div>

          ${t.show_bank_details && t.bank_name ? `
            <div style="background: #f8fafc; padding: 10px; border-radius: 8px; margin-bottom: 20px; font-size: 10px; color: #475569; border: 1px solid #e2e8f0;">
              <b>Реквізити:</b> ${t.bank_name} ${t.bank_account ? `| Рахунок: ${t.bank_account}` : ''}
            </div>
          ` : ''}

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
              <tr style="background: ${t.header_color || '#f1f5f9'}; color: ${t.header_color ? 'white' : '#475569'};">
                <th style="padding: 12px 10px; text-align: left; font-size: 11px; text-transform: uppercase;">Дата / Здано</th>
                <th style="padding: 12px 10px; text-align: left; font-size: 11px; text-transform: uppercase;">Пацієнт / Клініка</th>
                <th style="padding: 12px 10px; text-align: center; font-size: 11px; text-transform: uppercase;">Статус</th>
                <th style="padding: 12px 10px; text-align: right; font-size: 11px; text-transform: uppercase;">Сума</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <div style="width: 320px; margin-left: auto; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h3 style="margin: 0 0 15px 0; font-size: 12px; text-transform: uppercase; color: #94a3b8; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">Підсумок у валютах</h3>
            ${renderSummaryRow('Всього робіт', financeTotals.work)}
            ${renderSummaryRow('Сплачено', financeTotals.paid, '#10b981')}
            ${renderSummaryRow('Заборгованість', financeTotals.debt, '#ef4444')}
          </div>

          <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">${t.footer_text || 'Дякуємо за співпрацю!'}</p>
            <p style="font-size: 10px; color: #94a3b8;">Звіт сформовано в системі IMILab • ${format(new Date(), 'dd.MM.yyyy HH:mm')}</p>
          </div>
        </div>
      `;

      const el = document.createElement('div');
      el.innerHTML = contentHtml;
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      document.body.appendChild(el);

      const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false });
      document.body.removeChild(el);

      if (type === 'image') {
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        if (window.Capacitor && FunPrint) {
          await FunPrint.saveImageToGallery({ image: imgData, filename: `Report_${dr}_${Date.now()}.jpg` });
          alert('Звіт збережено!');
        } else {
          const link = document.createElement('a');
          link.download = `Report_${dr}.jpg`;
          link.href = imgData;
          link.click();
        }
      } else {
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdfWidth = 210;
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        // Створюємо PDF з динамічною висотою, щоб нічого не обрізалося
        const pdf = new jsPDF({
          orientation: 'p',
          unit: 'mm',
          format: [pdfWidth, pdfHeight]
        });

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

        const fileName = `Звіт_${dr.replace(/\s+/g, '_')}_${format(new Date(), 'dd_MM_yyyy')}.pdf`;

        if (window.Capacitor && FunPrint) {
          await FunPrint.savePdfToFile({ data: pdf.output('datauristring'), filename: fileName });
          alert('PDF готовий!');
        } else {
          pdf.save(fileName);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Помилка: ' + err.message);
    }
  };

  if (ordersLoading) return <div className="flex items-center justify-center h-screen bg-white"><div className="flex flex-col items-center gap-3"><RefreshCw className="animate-spin text-blue-600 w-10 h-10" /><p className="text-sm font-bold text-slate-500">Завантаження...</p></div></div>;

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-7xl mx-auto pb-10">
      <div className="bg-slate-900 text-white p-4 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-emerald-500">
        <div className="flex items-center gap-3"><Coins className="text-emerald-400 w-5 h-5" /><div><h2 className="text-[10px] font-black uppercase text-slate-400">Курси Monobank</h2><p className="text-sm font-mono flex gap-4"><span>USD: <b>{exchangeRates.USD.toFixed(2)}</b></span><span>EUR: <b>{exchangeRates.EUR.toFixed(2)}</b></span></p></div></div>
        <button onClick={() => window.location.reload()}><RefreshCw className="w-5 h-5" /></button>
      </div>

      <Card className="bg-slate-950 text-white rounded-2xl border-t border-white/10 overflow-hidden shadow-2xl">
        <CardContent className="p-6 space-y-5">
          <div className="flex justify-between items-center"><div className="flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" /><h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Калькулятор</h3></div><span className="text-[10px] text-slate-500 bg-white/5 px-2 py-1 rounded-full border border-white/5">LIVE</span></div>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex gap-2 w-full md:w-auto"><input type="number" value={calcAmount} onChange={e => setCalcAmount(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full md:w-32 outline-none focus:border-white/30" /><select value={calcFrom} onChange={e => setCalcFrom(e.target.value)} className="bg-slate-900 border border-white/10 rounded-xl px-2 py-3 text-xs outline-none"><option value="UAH">UAH</option><option value="USD">USD</option><option value="EUR">EUR</option></select></div>
            <ArrowLeftRight className="text-slate-500 hidden md:block" />
            <div className="w-full md:w-auto"><select value={calcTo} onChange={e => setCalcTo(e.target.value)} className="bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-xs w-full outline-none"><option value="UAH">UAH</option><option value="USD">USD</option><option value="EUR">EUR</option></select></div>
            <div className="flex-1 w-full text-center md:text-right bg-white/[0.03] p-4 rounded-2xl border border-white/5">
              <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Результат</p>
              <div className="flex items-baseline justify-center md:justify-end gap-2"><span className="text-3xl font-black">{calcResultValue.toLocaleString('uk-UA', { maximumFractionDigits: 2 })}</span><span className="text-sm font-bold text-slate-400">{calcTo}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="bg-white p-5 rounded-2xl border shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <h1 className="text-2xl font-black text-slate-800">АНАЛІТИКА</h1>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setFilterMode('month')} className={`px-5 py-2 text-xs font-black rounded-lg transition-all ${filterMode==='month'?'bg-white shadow text-blue-700':'text-slate-500'}`}>МІСЯЦЬ</button>
            <button onClick={() => setFilterMode('period')} className={`px-5 py-2 text-xs font-black rounded-lg transition-all ${filterMode==='period'?'bg-white shadow text-blue-700':'text-slate-500'}`}>ПЕРІОД</button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {filterMode === 'month' ? (
            <div className="flex gap-2 w-full lg:col-span-1"><select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="h-11 flex-1 border-2 border-slate-100 rounded-xl px-3 text-sm font-bold bg-slate-50">{MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select><select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="h-11 w-24 border-2 border-slate-100 rounded-xl px-3 text-sm font-bold bg-slate-50">{YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}</select></div>
          ) : (
            <div className="flex gap-2 w-full lg:col-span-1"><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-11 font-bold" /><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-11 font-bold" /></div>
          )}
          <div className="space-y-1 w-full"><Label className="text-[10px] font-black uppercase text-slate-400 ml-2">Клініка</Label><Select value={selectedClinic} onValueChange={handleClinicChange}><SelectTrigger className="h-11 border-2 border-slate-100 rounded-xl bg-slate-50 font-bold"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="_all">🏥 Всі клініки</SelectItem>{filterOptions.clinics.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1 w-full"><Label className="text-[10px] font-black uppercase text-slate-400 ml-2">Лікар</Label><Select value={selectedDoctor} onValueChange={handleDoctorChange}><SelectTrigger className="h-11 border-2 border-slate-100 rounded-xl bg-slate-50 font-bold"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="_all">👨‍⚕️ Всі лікарі</SelectItem>{filterOptions.doctors.map(dName => <SelectItem key={dName} value={dName}>{dName}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1 w-full"><Label className="text-[10px] font-black uppercase text-blue-500 ml-2">Валюта</Label><Select value={reportCurrency} onValueChange={setReportCurrency}><SelectTrigger className="h-11 border-2 border-blue-200 rounded-xl bg-blue-50 font-black text-blue-700 shadow-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UAH">🇺🇦 UAH</SelectItem><SelectItem value="USD">🇺🇸 USD</SelectItem><SelectItem value="EUR">🇪🇺 EUR</SelectItem><SelectItem value="ORIGINAL">📦 БД</SelectItem></SelectContent></Select></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-8 border-l-slate-800 shadow-md"><CardContent className="p-6 flex justify-between items-center"><div><p className="text-[10px] font-black text-slate-400 uppercase">Роботи</p><p className="text-xs font-bold text-slate-500">{activeOrders.length} замовлень</p></div>{renderCur(displayTotals.work, "text-2xl text-slate-900")}</CardContent></Card>
        <Card className="border-l-8 border-l-emerald-500 shadow-md"><CardContent className="p-6 flex justify-between items-center"><p className="text-[10px] font-black text-emerald-600 uppercase">Сплачено</p>{renderCur(displayTotals.paid, "text-2xl text-emerald-600")}</CardContent></Card>
        <Card className="border-l-8 border-l-rose-500 shadow-md"><CardContent className="p-6 flex justify-between items-center"><p className="text-[10px] font-black text-rose-600 uppercase">Борги</p>{renderCur(displayTotals.debt, "text-2xl text-rose-600")}</CardContent></Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex justify-between items-center"><Wallet className="text-amber-500 w-6 h-6" /><div className="text-right"><p className="text-[10px] font-bold text-amber-700 uppercase">ЗП техніка</p><p className="text-xl font-black text-amber-600">{totalTechPay.toLocaleString()} {reportCurrency==='ORIGINAL'?'грн':reportCurrency}</p></div></div>
        <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200 flex justify-between items-center"><TrendingUp className="text-purple-500 w-6 h-6" /><div className="text-right"><p className="text-[10px] font-bold text-purple-700 uppercase">Прибуток</p><p className="text-xl font-black text-purple-600">{netProfit.toLocaleString()} {reportCurrency==='ORIGINAL'?'грн':reportCurrency}</p></div></div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-white border rounded-3xl shadow-lg overflow-hidden">
        <TabsList className="bg-slate-50 w-full justify-start border-b px-6 h-14 gap-4"><TabsTrigger value="table" className="text-xs font-black uppercase">Список</TabsTrigger><TabsTrigger value="export" className="text-xs font-black uppercase">Експорт</TabsTrigger></TabsList>
        <TabsContent value="table" className="p-0">
          <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead className="bg-slate-50 font-black text-slate-400 uppercase border-b"><tr><th className="p-5">Дата</th><th className="p-5">Пацієнт</th><th className="p-5 text-right">Сума (${reportCurrency})</th><th className="p-5 text-center">Статус</th></tr></thead><tbody className="divide-y divide-slate-100">
            {activeOrders.map(o => (
              <tr key={o.id} className="hover:bg-blue-50/40">
                <td className="p-5 text-slate-500 font-medium">{o.creation_date}</td>
                <td className="p-5"><div className="font-bold text-slate-800 text-sm">{o.patient_name}</div><div className="text-[10px] text-slate-400">{o.clinic_name}</div></td>
                <td className="p-5 text-right font-black text-slate-900 text-sm">{getOrderTotalInCurrency(o, reportCurrency === 'ORIGINAL' ? 'UAH' : reportCurrency).toFixed(0)}</td>
                <td className="p-5 text-center"><span className={`px-3 py-1 rounded-lg text-[10px] font-black border-2 ${o.payment_status?.includes('Оплачено') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>{o.payment_status || 'Борг'}</span></td>
              </tr>
            ))}
          </tbody></table></div>
        </TabsContent>
        <TabsContent value="export" className="p-6 md:p-10 text-center space-y-6">
           <div className="max-w-md mx-auto space-y-6">
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto border-2 border-blue-100 shadow-inner">
                <FileCheck className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Формування звіту</h3>
                <p className="text-sm text-slate-500">
                  Звіт буде сформовано для: <b className="text-slate-900">{selectedDoctor === '_all' ? 'Всіх лікарів' : selectedDoctor}</b>
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-dashed border-slate-200 text-left space-y-3">
                <div className="flex justify-between text-xs font-bold uppercase text-slate-400">
                  <span>Кількість робіт:</span>
                  <span className="text-slate-900">{activeOrders.length}</span>
                </div>
                <div className="pt-2 border-t border-slate-200">
                   <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Підсумок у валютах:</p>
                   {Object.entries(financeTotals.work).filter(([_, v]) => v > 0).map(([curr, val]) => (
                     <div key={curr} className="flex justify-between text-sm font-black text-blue-600">
                       <span>{curr}:</span>
                       <span>{val.toLocaleString()} {curr==='UAH'?'₴':curr==='USD'?'$':'€'}</span>
                     </div>
                   ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <Button onClick={() => handleNativeShare('pdf')} className="h-16 bg-blue-600 hover:bg-blue-700 font-black rounded-2xl shadow-xl active:scale-95 transition-all gap-2 text-lg">
                  <Download className="w-5 h-5" /> ЗБЕРЕГТИ PDF
                </Button>
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={() => handleNativeShare('image')} variant="outline" className="h-14 font-black rounded-2xl gap-2 border-2"><ImageIcon className="w-4 h-4" /> ЯК ФОТО</Button>
                  <Button onClick={handleExcel} variant="outline" className="h-14 font-black rounded-2xl gap-2 border-2"><FileSpreadsheet className="w-4 h-4" /> EXCEL</Button>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                * Використовується шаблон: {templateData?.company_name || 'Стандартний'}
              </p>
           </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
