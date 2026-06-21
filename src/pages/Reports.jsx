import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient'; 
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Calendar, Building2, UserRound, FileSpreadsheet, FileText, X, 
  TrendingUp, Wallet, AlertCircle, RefreshCw, ArrowLeftRight, 
  Copy, Printer, Download, FileCheck 
} from 'lucide-react';
import { format, getMonth, getYear, parseISO, isWithinInterval } from 'date-fns';
import { uk } from 'date-fns/locale';
import * as XLSX from 'xlsx';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i),
  label: format(new Date(2026, i, 1), 'LLLL', { locale: uk }),
}));

const YEARS = [2024, 2025, 2026, 2027];

export default function Reports() {
  const now = new Date();
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(String(getMonth(now)));
  const [selectedYear, setSelectedYear] = useState(String(getYear(now)));
  
  const [selectedClinic, setSelectedClinic] = useState('_all');
  const [selectedDoctor, setSelectedDoctor] = useState('_all');
  const [activeTab, setActiveTab] = useState('table');

  // === API Monobank ===
  const [exchangeRates, setExchangeRates] = useState({ USD: 41.5, EUR: 44.5 });
  const [isRateLoading, setIsRateLoading] = useState(true);
  const [rateError, setRateError] = useState(null);

  const fetchRates = async () => {
    // Перевіряємо кеш у localStorage (1 година)
    const cached = localStorage.getItem('exchangeRates');
    const cachedTime = localStorage.getItem('exchangeRatesTime');
    const now = Date.now();
    if (cached && cachedTime && (now - parseInt(cachedTime)) < 3600000) {
      try {
        const parsed = JSON.parse(cached);
        setExchangeRates(parsed);
        setIsRateLoading(false);
        return;
      } catch {}
    }

    setIsRateLoading(true);
    setRateError(null);
    try {
      const response = await fetch('https://api.monobank.ua/bank/currency');
      if (!response.ok) throw new Error('Monobank API не відповідає');
      const data = await response.json();
      const usdRate = data.find(r => r.currencyCodeA === 840 && r.currencyCodeB === 980);
      const eurRate = data.find(r => r.currencyCodeA === 978 && r.currencyCodeB === 980);
      if (usdRate && eurRate) {
        const rates = {
          USD: usdRate.rateSell || usdRate.rateCross,
          EUR: eurRate.rateSell || eurRate.rateCross,
        };
        setExchangeRates(rates);
        localStorage.setItem('exchangeRates', JSON.stringify(rates));
        localStorage.setItem('exchangeRatesTime', String(now));
      } else {
        throw new Error('Не знайдено курси USD/EUR');
      }
    } catch (err) {
      console.error('Помилка отримання курсів:', err);
      setRateError('Не вдалося завантажити актуальні курси. Використовуються збережені.');
    } finally {
      setIsRateLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  // Калькулятор конвертації
  const [calcAmount, setCalcAmount] = useState('100');
  const [calcFrom, setCalcFrom] = useState('USD');
  const [calcTo, setCalcTo] = useState('UAH');
  const [calcResult, setCalcResult] = useState(0);

  useEffect(() => {
    const amount = parseFloat(calcAmount) || 0;
    if (amount === 0) {
      setCalcResult(0);
      return;
    }
    let amountInUah = amount;
    if (calcFrom === 'USD') amountInUah = amount * exchangeRates.USD;
    if (calcFrom === 'EUR') amountInUah = amount * exchangeRates.EUR;
    let finalResult = amountInUah;
    if (calcTo === 'USD') finalResult = amountInUah / exchangeRates.USD;
    if (calcTo === 'EUR') finalResult = amountInUah / exchangeRates.EUR;
    setCalcResult(finalResult);
  }, [calcAmount, calcFrom, calcTo, exchangeRates]);

  const handleSwapCurrencies = () => {
    setCalcFrom(calcTo);
    setCalcTo(calcFrom);
  };

  // Завантаження нарядів з Supabase
  const { data: rawOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['reports-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('WorkOrder').select('*').order('creation_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Завантаження шаблону інвойсу (налаштування компанії)
  const { data: templateData, isLoading: templateLoading } = useQuery({
    queryKey: ['invoiceTemplate'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('InvoiceTemplate')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data || {};
    },
  });

  const orders = useMemo(() => Array.isArray(rawOrders) ? rawOrders : [], [rawOrders]);

  const checkIfFullyPaid = (order) => {
    if (!order) return false;
    if (order.payment_status) {
      const pStatus = String(order.payment_status).trim().toLowerCase();
      return pStatus === 'оплачено' || pStatus === 'paid' || pStatus === 'сплачено';
    }
    if (order.status) {
      const status = String(order.status).trim().toLowerCase();
      return status === 'оплачено' || status === 'paid' || status === 'сплачено';
    }
    return false;
  };

  const filterOptions = useMemo(() => {
    const clinicsMap = new Map();
    const doctorsSet = new Set();
    orders.forEach(o => {
      if (!o) return;
      if (o.clinic_id && o.clinic_name) clinicsMap.set(o.clinic_id.toString(), o.clinic_name);
      if (o.doctor_name && (selectedClinic === '_all' || o.clinic_id?.toString() === selectedClinic)) {
        doctorsSet.add(o.doctor_name);
      }
    });
    return {
      clinics: Array.from(clinicsMap.entries()).map(([id, name]) => ({ id, name })),
      doctors: Array.from(doctorsSet).sort()
    };
  }, [orders, selectedClinic]);

  const handleClinicChange = (clinicId) => {
    setSelectedClinic(clinicId);
    setSelectedDoctor('_all');
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (!o?.creation_date) return false;
      const orderDate = parseISO(o.creation_date);
      if (useCustomDates) {
        if (customDateFrom && customDateTo) {
          const start = parseISO(customDateFrom);
          const end = parseISO(customDateTo);
          if (!isWithinInterval(orderDate, { start, end })) return false;
        }
      } else {
        if (getMonth(orderDate) !== parseInt(selectedMonth) || getYear(orderDate) !== parseInt(selectedYear)) return false;
      }
      if (selectedClinic !== '_all' && o.clinic_id?.toString() !== selectedClinic) return false;
      if (selectedDoctor !== '_all' && o.doctor_name !== selectedDoctor) return false;
      return true;
    });
  }, [orders, useCustomDates, customDateFrom, customDateTo, selectedMonth, selectedYear, selectedClinic, selectedDoctor]);

  const activeOrders = useMemo(() => {
    return filteredOrders.filter(o => o?.status && String(o.status).toLowerCase().trim() !== 'скасовано');
  }, [filteredOrders]);

  // Групування за клініками та лікарями для акта звірки
  const groupedOrders = useMemo(() => {
    const groups = {};
    activeOrders.forEach(order => {
      const clinicKey = order.clinic_id || 'private';
      const clinicName = order.clinic_name || 'Приватна практика';
      const doctorName = order.doctor_name || 'Не вказано';
      if (!groups[clinicKey]) {
        groups[clinicKey] = {
          clinicName,
          doctors: {}
        };
      }
      if (!groups[clinicKey].doctors[doctorName]) {
        groups[clinicKey].doctors[doctorName] = [];
      }
      groups[clinicKey].doctors[doctorName].push(order);
    });
    return groups;
  }, [activeOrders]);

  const financeTotals = useMemo(() => {
    const totals = {
      work: { UAH: 0, USD: 0, EUR: 0 },
      paid: { UAH: 0, USD: 0, EUR: 0 },
      debt: { UAH: 0, USD: 0, EUR: 0 }
    };

    activeOrders.forEach(o => {
      let items = [];
      try { items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch(e) { items = []; }

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
      items.forEach(item => {
        const currency = item?.price_currency || 'UAH';
        if (orderCurrencyTotals[currency] !== undefined) {
          orderCurrencyTotals[currency] += parseFloat(item?.total) || 0;
        }
      });

      ['UAH', 'USD', 'EUR'].forEach(curr => {
        if (orderCurrencyTotals[curr] > 0 && discountPercent > 0) {
          orderCurrencyTotals[curr] = orderCurrencyTotals[curr] * (1 - discountPercent / 100);
        }
        totals.work[curr] += orderCurrencyTotals[curr];
      });

      if (isPaid) {
        ['UAH', 'USD', 'EUR'].forEach(curr => { totals.paid[curr] += orderCurrencyTotals[curr]; });
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
          remainingGrnPaid -= (usedUsd * exchangeRates.USD);
        }
        if (remainingGrnPaid > 0 && orderCurrencyTotals.EUR > 0) {
          const eurEquivalentPaid = remainingGrnPaid / exchangeRates.EUR;
          const usedEur = Math.min(orderCurrencyTotals.EUR, eurEquivalentPaid);
          totals.paid.EUR += usedEur;
        }
      }
    });

    ['UAH', 'USD', 'EUR'].forEach(curr => {
      const diff = totals.work[curr] - totals.paid[curr];
      totals.debt[curr] = diff < 0.01 ? 0 : diff;
    });

    return totals;
  }, [activeOrders, exchangeRates]);

  const totalTechPay = useMemo(() => activeOrders.reduce((sum, o) => sum + (parseFloat(o?.technician_total_pay) || 0), 0), [activeOrders]);
  const netProfit = useMemo(() => activeOrders.reduce((sum, o) => sum + (parseFloat(o?.net_profit) || 0), 0), [activeOrders]);

  const renderCurrencyList = (currencyObj, colorClass = "") => {
    const activeValues = Object.entries(currencyObj).filter(([_, val]) => val > 0);
    if (activeValues.length === 0) return <span className={colorClass}>0 грн</span>;
    return (
      <div className="flex flex-col text-right">
        {activeValues.map(([curr, val]) => (
          <span key={curr} className={`font-bold tracking-tight ${colorClass}`}>
            {val.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} {curr === 'UAH' ? 'грн' : curr === 'USD' ? '$' : '€'}
          </span>
        ))}
      </div>
    );
  };

  // === Генерація звіту з усіма змінними шаблону (без діаграм) ===
  const generateFullReportHTML = () => {
    const tpl = templateData || {};
    const companyName = tpl.company_name || '1M Lab';
    const companyAddress = tpl.company_address || '';
    const companyPhone = tpl.company_phone || '';
    const companyEmail = tpl.company_email || '';
    const companyCode = tpl.company_code || '';
    const bankName = tpl.bank_name || '';
    const bankAccount = tpl.bank_account || '';
    const headerColor = tpl.header_color || '#1e293b';
    const summaryColor = tpl.summary_color || '#1e293b';
    const footerText = tpl.footer_text || '';
    const invoiceTitle = tpl.invoice_title || 'Фінансовий звіт';
    const logoUrl = tpl.logo_url || '';
    const showBankDetails = tpl.show_bank_details !== undefined ? tpl.show_bank_details : true;
    const showCompanyCode = tpl.show_company_code !== undefined ? tpl.show_company_code : true;

    const periodTitle = useCustomDates 
      ? `період з ${customDateFrom} по ${customDateTo}`
      : `${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear} р.`;

    const clinicTitle = selectedClinic !== '_all' ? (filterOptions.clinics.find(c => c.id === selectedClinic)?.name || '') : 'Всі клініки';
    const doctorTitle = selectedDoctor !== '_all' ? selectedDoctor : 'Всі лікарі';

    // Підрахунки для звіту
    const totalOrders = activeOrders.length;
    const totalClinics = new Set(activeOrders.map(o => o.clinic_id).filter(Boolean)).size;
    const totalDoctors = new Set(activeOrders.map(o => o.doctor_name).filter(Boolean)).size;
    const totalSum = Object.values(financeTotals.work).reduce((a, b) => a + b, 0);
    const totalPaid = Object.values(financeTotals.paid).reduce((a, b) => a + b, 0);
    const totalDebt = Object.values(financeTotals.debt).reduce((a, b) => a + b, 0);

    // Таблиця деталей по клініках
    let clinicDetails = '';
    for (const clinicKey in groupedOrders) {
      const clinic = groupedOrders[clinicKey];
      clinicDetails += `<div class="clinic-block">
        <h3>🏥 ${clinic.clinicName}</h3>`;
      for (const doctorName in clinic.doctors) {
        const ordersList = clinic.doctors[doctorName];
        const doctorSum = ordersList.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
        clinicDetails += `
          <div class="doctor-block">
            <h4>👨‍⚕️ ${doctorName} (${ordersList.length} нарядів, сума: ${doctorSum.toFixed(2)} грн)</h4>
            <table class="report-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Пацієнт</th>
                  <th>Дата</th>
                  <th>Сума</th>
                  <th>Статус оплати</th>
                </tr>
              </thead>
              <tbody>
                ${ordersList.map((o, idx) => `
                  <tr>
                    <td>${idx+1}</td>
                    <td>${o.patient_name || 'Не вказано'}</td>
                    <td>${o.creation_date ? format(parseISO(o.creation_date), 'dd.MM.yyyy') : '-'}</td>
                    <td>${(parseFloat(o.total_amount) || 0).toFixed(2)} грн</td>
                    <td>${o.payment_status || 'Борг'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`;
      }
      clinicDetails += `</div>`;
    }

    const achievements = `
      <div class="achievements-grid">
        <div class="achievement-card">
          <div class="achievement-number">${totalOrders}</div>
          <div class="achievement-label">Виконано нарядів</div>
        </div>
        <div class="achievement-card">
          <div class="achievement-number">${totalClinics}</div>
          <div class="achievement-label">Клінік-партнерів</div>
        </div>
        <div class="achievement-card">
          <div class="achievement-number">${totalDoctors}</div>
          <div class="achievement-label">Лікарів-стоматологів</div>
        </div>
        <div class="achievement-card">
          <div class="achievement-number">${totalSum.toFixed(0)} ₴</div>
          <div class="achievement-label">Загальна сума робіт</div>
        </div>
        <div class="achievement-card">
          <div class="achievement-number">${totalPaid.toFixed(0)} ₴</div>
          <div class="achievement-label">Сплачено клієнтами</div>
        </div>
        <div class="achievement-card">
          <div class="achievement-number" style="color: #ef4444;">${totalDebt.toFixed(0)} ₴</div>
          <div class="achievement-label">Заборгованість</div>
        </div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${invoiceTitle} — ${companyName}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          :root {
            --brand-dark: ${headerColor};
            --brand-muted: #475569;
            --accent-gradient: linear-gradient(135deg, ${headerColor} 0%, ${summaryColor} 100%);
            --bg-global: #f8fafc;
            --card-bg: #ffffff;
            --border-subtle: #f1f5f9;
            --text-main: #1e293b;
            --text-muted: #64748b;
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;
            background: var(--bg-global);
            color: var(--text-main);
            padding: 40px 20px;
            -webkit-font-smoothing: antialiased;
          }
          .report-wrapper {
            max-width: 1140px;
            margin: 0 auto;
            background: var(--card-bg);
            border-radius: 24px;
            box-shadow: 0 20px 50px rgba(17,18,21,0.04);
            padding: 50px 60px;
            border: 1px solid rgba(241,245,249,0.8);
          }
          .header-flex {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 35px;
            margin-bottom: 40px;
            flex-wrap: wrap;
            gap: 20px;
          }
          .brand-meta {
            display: flex;
            align-items: center;
            gap: 24px;
          }
          .logo-container {
            width: 85px;
            height: 85px;
            border-radius: 20px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
          }
          .logo-img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          .logo-text {
            font-size: 32px;
            font-weight: 800;
            color: var(--brand-dark);
            letter-spacing: -1px;
          }
          .logo-text span {
            background: var(--brand-dark);
            color: white;
            padding: 2px 12px;
            border-radius: 40px;
            font-size: 18px;
            font-weight: 600;
            margin-left: 8px;
          }
          .title-meta h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: -0.5px;
            color: var(--brand-dark);
          }
          .title-meta p {
            margin: 4px 0 0 0;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: var(--text-muted);
            font-weight: 600;
          }
          .doc-info {
            text-align: right;
            font-size: 13px;
            color: var(--text-muted);
            line-height: 1.6;
          }
          .doc-info span {
            color: var(--brand-dark);
            font-weight: 600;
          }
          .kpi-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 24px;
            margin-bottom: 45px;
          }
          .kpi-minimal {
            background: #ffffff;
            border: 1px solid var(--border-subtle);
            border-radius: 16px;
            padding: 24px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.01);
          }
          .kpi-minimal::before {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 4px; height: 100%;
            background: var(--accent-gradient);
          }
          .kpi-label {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-muted);
            margin-bottom: 8px;
          }
          .kpi-num {
            font-size: 30px;
            font-weight: 700;
            color: var(--brand-dark);
            letter-spacing: -1px;
          }
          .clinic-block {
            margin-bottom: 32px;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            overflow: hidden;
          }
          .clinic-block h3 {
            background: #f1f5f9;
            padding: 14px 20px;
            font-size: 18px;
            margin: 0;
            color: #0f172a;
          }
          .doctor-block {
            padding: 16px 20px;
            border-top: 1px solid #e2e8f0;
          }
          .doctor-block h4 {
            font-size: 15px;
            color: #334155;
            margin-bottom: 12px;
          }
          .report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }
          .report-table th {
            background: #f1f5f9;
            padding: 10px 12px;
            text-align: left;
            font-weight: 600;
            color: #1e293b;
            border-bottom: 2px solid #cbd5e1;
          }
          .report-table td {
            padding: 8px 12px;
            border-bottom: 1px solid #e2e8f0;
          }
          .report-table tr:last-child td {
            border-bottom: none;
          }
          .summary-box {
            background: #f8fafc;
            border-radius: 16px;
            padding: 24px 28px;
            margin-top: 30px;
            border: 1px solid #e2e8f0;
          }
          .summary-box h3 {
            font-size: 20px;
            margin-bottom: 16px;
            color: #0f172a;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px dashed #e2e8f0;
            font-size: 15px;
          }
          .summary-row:last-child {
            border-bottom: none;
          }
          .summary-row.total {
            font-weight: 700;
            font-size: 18px;
            color: #0f172a;
            border-bottom: 2px solid #475569;
            padding-bottom: 12px;
            margin-bottom: 6px;
          }
          .footer {
            margin-top: 50px;
            padding-top: 30px;
            border-top: 2px solid #e2e8f0;
            text-align: center;
            font-size: 14px;
            color: #64748b;
          }
          .footer .signature {
            display: flex;
            justify-content: space-between;
            margin: 30px 0 20px;
            font-weight: 600;
            color: #0f172a;
          }
          @media print {
            body { background: white; padding: 0; }
            .report-wrapper { box-shadow: none; border-radius: 0; padding: 30px 40px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="report-wrapper">
          <!-- Header -->
          <div class="header-flex">
            <div class="brand-meta">
              <div class="logo-container">
                ${logoUrl ? `<img src="${logoUrl}" alt="Логотип" class="logo-img">` : `<div class="logo-text">${companyName.split(' ')[0]}<span>LAB</span></div>`}
              </div>
              <div class="title-meta">
                <h1>${companyName}</h1>
                <p>${invoiceTitle}</p>
              </div>
            </div>
            <div class="doc-info">
              <p>Документ: <span>${invoiceTitle}</span></p>
              <p>Звітний період: <span>${periodTitle}</span></p>
              <p>Згенеровано: <span>${format(new Date(), 'dd.MM.yyyy HH:mm')}</span></p>
            </div>
          </div>

          <!-- Контакти компанії (тільки якщо є дані) -->
          <div class="meta-info" style="background: #f1f5f9; padding: 18px 24px; border-radius: 12px; margin-bottom: 30px; display: flex; flex-wrap: wrap; justify-content: space-between; font-size: 14px; color: #334155;">
            ${companyAddress ? `<div><strong>Адреса:</strong> ${companyAddress}</div>` : ''}
            ${companyPhone ? `<div><strong>Телефон:</strong> ${companyPhone}</div>` : ''}
            ${companyEmail ? `<div><strong>Email:</strong> ${companyEmail}</div>` : ''}
            ${(showCompanyCode && companyCode) ? `<div><strong>КВЕР:</strong> ${companyCode}</div>` : ''}
            <div><strong>Клініка:</strong> ${clinicTitle}</div>
            <div><strong>Лікар:</strong> ${doctorTitle}</div>
            <div><strong>Курс валют:</strong> 1 USD = ${exchangeRates.USD.toFixed(2)} грн | 1 EUR = ${exchangeRates.EUR.toFixed(2)} грн</div>
          </div>

          <!-- KPI -->
          <div class="kpi-row">
            <div class="kpi-minimal">
              <div class="kpi-label">Виконано нарядів</div>
              <div class="kpi-num">${totalOrders}</div>
            </div>
            <div class="kpi-minimal">
              <div class="kpi-label">Клінік-партнерів</div>
              <div class="kpi-num">${totalClinics}</div>
            </div>
            <div class="kpi-minimal">
              <div class="kpi-label">Лікарів-стоматологів</div>
              <div class="kpi-num">${totalDoctors}</div>
            </div>
            <div class="kpi-minimal">
              <div class="kpi-label">Загальна сума</div>
              <div class="kpi-num">${totalSum.toFixed(0)} ₴</div>
            </div>
          </div>

          <!-- Детальний звіт по клініках/лікарях -->
          <h2 style="font-size: 24px; font-weight: 700; margin: 40px 0 20px; color: #0f172a; position: relative; padding-left: 20px;">
            <span style="position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: ${headerColor}; border-radius: 4px;"></span>
            📋 Детальний звіт по нарядах
          </h2>
          ${clinicDetails || '<p style="color: #64748b;">Немає даних за обраний період</p>'}

          <!-- Банківські реквізити (якщо включено) -->
          ${showBankDetails && (bankName || bankAccount) ? `
            <div class="summary-box" style="margin-top: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px;">
              <h4 style="font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 8px;">Банківські реквізити</h4>
              <div style="font-size: 14px; color: #334155;">
                ${bankName ? `<div><strong>Банк:</strong> ${bankName}</div>` : ''}
                ${bankAccount ? `<div><strong>Рахунок:</strong> ${bankAccount}</div>` : ''}
              </div>
            </div>
          ` : ''}

          <!-- Фінансове резюме -->
          <div class="summary-box">
            <h3>💰 Фінансовий підсумок</h3>
            ${Object.entries(financeTotals.work).filter(([_, v]) => v > 0).map(([curr, val]) => `
              <div class="summary-row">
                <span>Загальна вартість робіт (${curr})</span>
                <span>${val.toFixed(2)} ${curr}</span>
              </div>
              <div class="summary-row" style="color: #10b981;">
                <span>Сплачено клієнтами (${curr})</span>
                <span>${financeTotals.paid[curr].toFixed(2)} ${curr}</span>
              </div>
              <div class="summary-row" style="color: #ef4444;">
                <span>Заборгованість (${curr})</span>
                <span>${financeTotals.debt[curr].toFixed(2)} ${curr}</span>
              </div>
            `).join('')}
            <div class="summary-row total">
              <span>Загальна сума до сплати (грн)</span>
              <span>${totalSum.toFixed(2)} грн</span>
            </div>
          </div>

          <!-- Підписи та додаткова інформація з шаблону -->
          <div class="footer">
            ${footerText ? `<p style="margin-bottom: 20px; font-size: 13px; color: #475569;">${footerText}</p>` : ''}
            <div class="signature">
              <div>${companyName} (Підпис)</div>
              <div>Лікар / Клініка (Підпис)</div>
            </div>
            <p>Звіт згенеровано автоматично ${format(new Date(), 'dd.MM.yyyy HH:mm')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // Функція для відкриття звіту в новому вікні та друку/збереження PDF
  const handleDoctorReport = () => {
    const html = generateFullReportHTML();
    const win = window.open('', '_blank', 'width=1100,height=800,scrollbars=yes');
    if (!win) {
      alert('Будь ласка, дозвольте спливаючі вікна для цього сайту.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 800);
  };

  // Експорт HTML-файлу
  const downloadHTML = () => {
    const html = generateFullReportHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Звіт_${format(new Date(), 'yyyy-MM-dd')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Експорт Excel
  const exportToExcel = () => {
    if (activeOrders.length === 0) {
      alert("Немає даних для експорту!");
      return;
    }
    const dataRows = activeOrders.map((o, idx) => ({
      '№': idx + 1,
      'Дата створення': o.creation_date || '',
      'Дата здачі': o.due_date || '',
      'Клініка': o.clinic_name || 'Приватна практика',
      'Лікар': o.doctor_name || 'Не вказано',
      'Пацієнт': o.patient_name || 'Не вказано',
      'Загальна сума (грн)': o.total_amount || 0,
      'Оплата': o.payment_status || 'Борг'
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Звіт нарядів");
    XLSX.writeFile(workbook, `Report_${useCustomDates ? 'custom' : selectedMonth}.xlsx`);
  };

  // Функція для друку акта звірки (стара)
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(getHtmlReportContent());
    printWindow.document.close();
    printWindow.print();
  };

  // Стара функція для акта звірки (збережена) з виправленням для швидких шаблонів
  const getHtmlReportContent = () => {
    const clinicTitle = selectedClinic !== '_all' ? (filterOptions.clinics.find(c => c.id === selectedClinic)?.name || '') : 'Всі клініки';
    const doctorTitle = selectedDoctor !== '_all' ? selectedDoctor : 'Всі лікарі';
    const periodTitle = useCustomDates 
      ? `період з ${customDateFrom} по ${customDateTo}`
      : `${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear} р.`;

    let groupsHtml = '';
    for (const clinicKey in groupedOrders) {
      const clinic = groupedOrders[clinicKey];
      groupsHtml += `<div class="clinic-group"><h3>${clinic.clinicName}</h3>`;
      for (const doctorName in clinic.doctors) {
        const ordersList = clinic.doctors[doctorName];
        groupsHtml += `<div class="doctor-group"><h4>Лікар: ${doctorName}</h4>`;
        groupsHtml += `<table class="report-table"><thead><tr><th>№</th><th>Дата</th><th>Пацієнт</th><th>Послуги</th><th>Сума</th><th>Статус оплати</th></tr></thead><tbody>`;
        ordersList.forEach((o, idx) => {
          let itemsList = [];
          try { itemsList = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch(e){}
          
          // Виправлення: для швидких шаблонів замінюємо назву на "Послуга"
          const servicesText = itemsList.map(i => {
            // Вважаємо, що якщо немає price_item_id або воно 'none' - це послуга з швидкого шаблону
            const isQuickTemplate = !i.price_item_id || i.price_item_id === 'none' || i.price_item_id === null;
            const displayName = isQuickTemplate ? 'Послуга' : (i.service_name || 'Послуга');
            return `${displayName} (x${i.quantity || 1})`;
          }).join('<br/>') || 'Базова робота';

          const priceText = itemsList.map(i => `${i.total || 0} ${i.price_currency || 'UAH'}`).join('<br/>') || `${o.total_amount} UAH`;
          groupsHtml += `<tr><td style="text-align:center">${idx+1}</td><td>${o.creation_date ? format(parseISO(o.creation_date), 'dd.MM.yyyy') : '-'}</td><td>${o.patient_name || 'Не вказано'}</td><td>${servicesText}</td><td style="text-align:right">${priceText}</td><td style="text-align:center">${o.payment_status || 'Борг'}</td></tr>`;
        });
        groupsHtml += `</tbody></table></div>`;
      }
      groupsHtml += `</div>`;
    }

    const currenciesSummaryHTML = Object.entries(financeTotals.work)
      .filter(([_, value]) => value > 0)
      .map(([curr, value]) => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Загальна вартість робіт (${curr}):</span>
          <b>${value.toFixed(2)} ${curr}</b>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #10b981;">
          <span>Сплачено клієнтом (${curr}):</span>
          <b>${financeTotals.paid[curr].toFixed(2)} ${curr}</b>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; color: #ef4444; border-bottom: 1px dashed #ddd; padding-bottom: 4px;">
          <span>Залишок заборгованості (${curr}):</span>
          <b>${financeTotals.debt[curr].toFixed(2)} ${curr}</b>
        </div>
      `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Акт звірки взаєморозрахунків</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #333; max-width: 1200px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #336699; padding-bottom: 15px; }
          .meta-info { background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 25px; border: 1px solid #e2e8f0; }
          .clinic-group { margin-bottom: 30px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
          .clinic-group h3 { background: #1e3a8a; color: white; margin: 0; padding: 10px 15px; font-size: 18px; }
          .doctor-group { margin: 0; border-top: 1px solid #cbd5e1; }
          .doctor-group h4 { background: #eef2ff; margin: 0; padding: 8px 15px; font-size: 14px; color: #1e3a8a; }
          .report-table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .report-table th { background: #f1f5f9; padding: 8px 10px; text-align: left; border-bottom: 1px solid #cbd5e1; }
          .report-table td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          .summary-box { width: 350px; margin-left: auto; background: #f1f5f9; padding: 15px; border-radius: 8px; margin-top: 30px; }
          .signatures { margin-top: 60px; display: flex; justify-content: space-between; }
          .sig-block { width: 40%; border-top: 1px solid #333; text-align: center; padding-top: 8px; font-weight: bold; }
          @media print { body { padding: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>АКТ ЗВІРКИ ВИКОНАНИХ РОБІТ</h2>
          <p>Автоматичний фінансовий звіт зуботехнічної лабораторії</p>
        </div>
        <div class="meta-info">
          <div><b>Період:</b> ${periodTitle}</div>
          <div><b>Контрагент/Клініка:</b> ${clinicTitle}</div>
          <div><b>Лікар:</b> ${doctorTitle}</div>
          <div><b>Курс валют:</b> 1 USD = ${exchangeRates.USD.toFixed(4)} грн | 1 EUR = ${exchangeRates.EUR.toFixed(4)} грн (Monobank)</div>
        </div>
        ${groupsHtml}
        <div class="summary-box">
          <h4 style="margin:0 0 10px 0;">РАЗОМ ДО СПЛАТИ:</h4>
          ${currenciesSummaryHTML}
        </div>
        <div class="signatures">
          <div class="sig-block">Лабораторія (Підпис)</div>
          <div class="sig-block">Клініка / Лікар (Підпис)</div>
        </div>
      </body>
      </html>
    `;
  };

  if (ordersLoading || templateLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-[1600px] mx-auto">
      
      {/* Блок курсу валют */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-800 text-white p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-md">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isRateLoading ? 'animate-spin' : ''}`} />
            Курс валют (Monobank)
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Автоматичне оновлення. Дані для фінансових розрахунків.
          </p>
          {rateError && <p className="text-xs text-amber-300 mt-1">{rateError}</p>}
        </div>
        <div className="flex gap-4 text-sm font-mono bg-black/20 px-4 py-2 rounded-lg border border-white/10">
          <div>USD: <span className="text-emerald-400 font-bold">{exchangeRates.USD.toFixed(4)} грн</span></div>
          <div className="border-l border-white/20 pl-4">EUR: <span className="text-amber-400 font-bold">{exchangeRates.EUR.toFixed(4)} грн</span></div>
          <button onClick={fetchRates} title="Оновити курс" className="text-slate-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4 mt-0.5" />
          </button>
        </div>
      </div>

      {/* Панель фільтрів */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-5 bg-white p-4 rounded-lg shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            Аналітичні звіти лабораторії
          </h1>
          <p className="text-sm text-muted-foreground">Фільтрація замовлень за критеріями та часом</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {!useCustomDates ? (
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 border rounded-md">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-9 w-36 bg-background border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="h-9 w-24 bg-background border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-blue-50/60 p-1.5 border border-blue-200 rounded-md">
              <Calendar className="w-4 h-4 text-blue-600 ml-1" />
              <Input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} className="h-8 w-36 text-xs bg-background" />
              <span className="text-xs font-medium text-slate-500">—</span>
              <Input type="date" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} className="h-8 w-36 text-xs bg-background" />
              <Button variant="ghost" size="icon" onClick={() => setUseCustomDates(false)} className="h-8 w-8 text-slate-500 hover:text-red-500"><X className="w-4 h-4" /></Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setUseCustomDates(!useCustomDates)} className="h-9 font-medium">
            {useCustomDates ? "До місяців" : "Період дат (Від/До)"}
          </Button>
        </div>
      </div>

      {/* Конвертер валют */}
      <Card className="bg-slate-50/50 border border-slate-200/80">
        <CardContent className="p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 mb-3">
            <ArrowLeftRight className="w-4 h-4 text-blue-600" /> Швидкий мультивалютний конвертер (за курсом Monobank)
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-32">
              <Input type="number" value={calcAmount} onChange={e => setCalcAmount(e.target.value)} className="h-9 bg-white" placeholder="Сума" />
            </div>
            <Select value={calcFrom} onValueChange={setCalcFrom}>
              <SelectTrigger className="h-9 w-24 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UAH">UAH (грн)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon" onClick={handleSwapCurrencies} className="h-9 w-9 border bg-white text-slate-500">
              <ArrowLeftRight className="w-4 h-4" />
            </Button>
            <Select value={calcTo} onValueChange={setCalcTo}>
              <SelectTrigger className="h-9 w-24 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UAH">UAH (грн)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm font-medium ml-2 text-slate-800">
              Результат конвертації: <span className="text-base font-bold text-blue-600 font-mono">{calcResult.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} {calcTo === 'UAH' ? 'грн' : calcTo === 'USD' ? '$' : '€'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Фільтри клінік/лікарів */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-100/70 p-4 border border-slate-200 rounded-xl">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" /> Фільтр за клініками:
          </label>
          <Select value={selectedClinic} onValueChange={handleClinicChange}>
            <SelectTrigger className="bg-background h-10 border-slate-300 shadow-sm">
              <SelectValue placeholder="Всі клініки" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">🏥 Всі клініки та приватні практики</SelectItem>
              {filterOptions.clinics.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <UserRound className="w-3.5 h-3.5" /> Фільтр за лікарями:
          </label>
          <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
            <SelectTrigger className="bg-background h-10 border-slate-300 shadow-sm">
              <SelectValue placeholder="Всі лікарі" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">👨‍⚕️ Всі лікарі ({filterOptions.doctors.length})</SelectItem>
              {filterOptions.doctors.map(doc => (
                <SelectItem key={doc} value={doc}>{doc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Картки фінансових результатів */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-slate-800 shadow-sm">
          <CardContent className="p-5 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Загальна вартість робіт</p>
              <span className="text-[10px] text-slate-400 block mt-0.5">Сума виконаних нарядів</span>
            </div>
            {renderCurrencyList(financeTotals.work, "text-xl font-extrabold text-slate-900")}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardContent className="p-5 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Фактично сплачено</p>
              <span className="text-[10px] text-slate-400 block mt-0.5">Зарахований дохід</span>
            </div>
            {renderCurrencyList(financeTotals.paid, "text-xl font-extrabold text-emerald-600")}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500 shadow-sm">
          <CardContent className="p-5 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">Залишок боргів клієнтів</p>
              <span className="text-[10px] text-slate-400 block mt-0.5">Неоплачена дебіторка</span>
            </div>
            {renderCurrencyList(financeTotals.debt, "text-xl font-extrabold text-rose-600")}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-l-4 border-l-amber-500 shadow-sm bg-amber-50/10">
          <CardContent className="p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-50 rounded-lg text-amber-500"><Wallet className="w-5 h-5" /></div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">На їду технікам</p>
                <h4 className="text-xl font-extrabold text-amber-600 mt-1">{totalTechPay.toLocaleString('uk-UA')} грн</h4>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500 shadow-sm bg-purple-50/10">
          <CardContent className="p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-50 rounded-lg text-purple-500"><TrendingUp className="w-5 h-5" /></div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Чистий прибуток лабораторії</p>
                <h4 className="text-xl font-extrabold text-purple-600 mt-1">{netProfit.toLocaleString('uk-UA')} грн</h4>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Вкладки: Таблиця / Акт звірки */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-100 w-full justify-start">
          <TabsTrigger value="table" className="data-[state=active]:bg-white">Таблиця нарядів</TabsTrigger>
          <TabsTrigger value="report" className="data-[state=active]:bg-white">Акт звірки (групований)</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Детальний список нарядів</h3>
                <p className="text-xs text-muted-foreground">Знайдено нарядів: <span className="font-bold text-slate-800">{activeOrders.length} шт.</span></p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={exportToExcel} variant="outline" className="h-10 text-xs font-semibold border-emerald-600 text-emerald-700 hover:bg-emerald-50 shrink-0">
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Excel
                </Button>
                <Button onClick={handlePrint} variant="outline" className="h-10 text-xs font-semibold border-blue-600 text-blue-700 hover:bg-blue-50 shrink-0">
                  <Printer className="w-4 h-4 mr-1.5" /> Акт звірки
                </Button>
                <Button onClick={handleDoctorReport} className="h-10 text-xs font-semibold bg-gradient-to-r from-blue-700 to-slate-800 text-white hover:opacity-90 shrink-0">
                  <FileCheck className="w-4 h-4 mr-1.5" /> Звіт для лікаря
                </Button>
                <Button onClick={downloadHTML} variant="outline" className="h-10 text-xs font-semibold border-purple-600 text-purple-700 hover:bg-purple-50 shrink-0">
                  <Download className="w-4 h-4 mr-1.5" /> HTML
                </Button>
              </div>
            </div>
            {activeOrders.length > 0 ? (
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-500 uppercase font-bold">
                    <tr>
                      <th className="p-3 text-center">№</th>
                      <th className="p-3">Дата</th>
                      <th className="p-3">Пацієнт</th>
                      <th className="p-3">Клініка & Лікар</th>
                      <th className="p-3 text-right">Сума (грн)</th>
                      <th className="p-3 text-center">Оплата</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {activeOrders.map((o, idx) => (
                      <tr key={o.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-center text-slate-400">{idx+1}</td>
                        <td className="p-3 font-medium">{o.creation_date}</td>
                        <td className="p-3 font-semibold">{o.patient_name || 'Не вказано'}</td>
                        <td className="p-3">
                          <div>{o.clinic_name || 'Приватна практика'}</div>
                          <div className="text-[10px] text-muted-foreground">{o.doctor_name || ''}</div>
                        </td>
                        <td className="p-3 text-right font-bold">{(o.total_amount || 0).toFixed(0)} грн</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${checkIfFullyPaid(o) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                            {o.payment_status || 'Борг'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-slate-400 border border-dashed rounded-lg">
                <AlertCircle className="w-8 h-8 mb-2" />
                <p className="text-xs">Немає даних за вибраними критеріями</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <h3 className="text-base font-bold text-slate-900">Акт звірки взаєморозрахунків</h3>
              <div className="flex gap-2">
                <Button onClick={handlePrint} className="h-9 text-xs gap-1">
                  <Printer className="w-3.5 h-3.5" /> Друк / PDF
                </Button>
                <Button onClick={() => { navigator.clipboard.writeText(getHtmlReportContent()); alert('Звіт скопійовано в буфер обміну (HTML)'); }} variant="outline" className="h-9 text-xs gap-1">
                  <Copy className="w-3.5 h-3.5" /> Копіювати HTML
                </Button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto border rounded-md p-4 bg-slate-50">
              <div dangerouslySetInnerHTML={{ __html: getHtmlReportContent() }} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}