import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../api/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Plus, FileText, Trash2, StickyNote, DollarSign, Tag, RotateCcw, Wrench, ChevronDown, ChevronUp, Palette, Lock } from 'lucide-react';

import ToothChart from './ToothChart';
import FileUploader from './FileUploader';

const VITA_SHADES = [
  'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4',
  'D2', 'D3', 'D4',
  'BL1', 'BL2', 'BL3', 'BL4'
];

export default function OrderForm({ order, onSubmit, onCancel, isSubmitting }) {
  const defaultForm = {
    creation_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: '',
    clinic_id: 'none',
    doctor_id: 'none',
    patient_name: '',
    patient_age: '',
    patient_gender: '',
    tooth_color: '',
    technician_id: 'none',
    status: 'Новий',
    payment_status: 'Борг',
    notes: '',
    items: [],
    file_urls: [],
    selected_teeth: [],
    expenses: '',
    discount: '',
    tooth_shades: {}
  };

  const safeParseArray = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('Помилка парсингу поля наряду:', e);
        return [];
      }
    }
    return [];
  };

  const buildFormFromOrder = (order) => {
    if (!order) return defaultForm;

    // Копіюємо всі дані з наряду
    const base = {
      ...defaultForm,
      ...order,
      tooth_shades: order.tooth_shades ? (typeof order.tooth_shades === 'string' ? JSON.parse(order.tooth_shades) : order.tooth_shades) : {}
    };

    // ГАРАНТУЄМО правильні типи для випадаючих списків (Select потребує String)
    base.clinic_id = order.clinic_id ? String(order.clinic_id) : 'none';
    base.doctor_id = order.doctor_id ? String(order.doctor_id) : 'none';
    base.technician_id = order.technician_id ? String(order.technician_id) : 'none';

    // Обробка послуг
    const items = safeParseArray(order.items).map(item => ({
      ...item,
      id: item.id || (Math.random().toString(36).substring(2, 9) + Date.now().toString(36)),
      date: item.date || order.creation_date || new Date().toISOString(),
      technician_service_id: item.technician_service_id ? String(item.technician_service_id) : 'none',
      price_item_id: item.price_item_id ? String(item.price_item_id) : 'none',
      price_currency: item.price_currency || 'UAH'
    }));

    // Обробка зубів (selected_teeth у схемі - ARRAY text[])
    let teeth = [];
    const rawTeeth = order.selected_teeth;

    if (Array.isArray(rawTeeth)) {
      teeth = rawTeeth.map(t => parseInt(t, 10)).filter(t => !isNaN(t));
    } else if (typeof rawTeeth === 'string' && rawTeeth.startsWith('{')) {
      // Обробка формату Postgres array string "{11,12}"
      teeth = rawTeeth.replace(/[{}]/g, '').split(',').map(t => parseInt(t.trim(), 10)).filter(t => !isNaN(t));
    }

    // Відновлення зубного ряду з items, якщо поле в базі пусте (як страховка)
    if (teeth.length === 0 && items.length > 0) {
      const recovered = [];
      items.forEach(i => {
        if (i.teeth_numbers) {
          const t = i.teeth_numbers;
          if (Array.isArray(t)) t.forEach(val => recovered.push(parseInt(val, 10)));
          else recovered.push(parseInt(t, 10));
        }
      });
      if (recovered.length > 0) {
        teeth = [...new Set(recovered.filter(t => !isNaN(t)))];
      }
    }

    base.selected_teeth = teeth;
    base.items = items;
    return base;
  };

  const [form, setForm] = useState(() => buildFormFromOrder(order));
  const [qty, setQty] = useState(1);
  const [mobileInvoiceOpen, setMobileInvoiceOpen] = useState(false);
  const [activeColoringTooth, setActiveColoringTooth] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (order?.id) {
      setForm(buildFormFromOrder(order));
      setTimeout(() => setIsReady(true), 500);
    } else {
      setForm(defaultForm);
      setIsReady(true);
    }
  }, [order?.id]);

  const [selectedTypeColor, setSelectedTypeColor] = useState(null);
  const [selectedPriceItemId, setSelectedPriceItemId] = useState('none');
  const [selectedTechServiceId, setSelectedTechServiceId] = useState('none');
  const [selectedCategory, setSelectedCategory] = useState('');

  const getCurrencySymbol = (currency) => {
    const symbols = { UAH: '₴', USD: '$', EUR: '€' };
    return symbols[currency] || '₴';
  };

  const getCurrencyLabel = (currency) => {
    const symbols = { UAH: 'грн', USD: '$', EUR: '€' };
    return symbols[currency] || 'грн';
  };

  // Завантаження довідників
  const { data: rawClinics, isLoading: clinicsLoading } = useQuery({
    queryKey: ['clinics-form-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clinic').select('*').order('name');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: rawDoctors, isLoading: doctorsLoading } = useQuery({
    queryKey: ['doctors-form-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('doctor').select('*').order('full_name');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: rawTechnicians, isLoading: techniciansLoading } = useQuery({
    queryKey: ['technicians-form-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('technician').select('*').eq('is_active', true).order('full_name');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: rawPriceItems, isLoading: priceItemsLoading } = useQuery({
    queryKey: ['priceItems-form-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('price_item').select('*').order('name');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: rawServiceCosts } = useQuery({
    queryKey: ['serviceCosts-form-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_cost').select('*');
      if (error) return [];
      return data || [];
    }
  });

  const { data: rawOrderTemplates } = useQuery({
    queryKey: ['orderTemplates-form-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('order_template').select('*').order('id');
      if (error) return [];
      return data || [];
    }
  });

  const { data: rawTechServices } = useQuery({
    queryKey: ['all-technician-services'],
    queryFn: async () => {
      const { data, error } = await supabase.from('technician_service').select('*');
      if (error) return [];
      return data || [];
    }
  });

  const clinics = Array.isArray(rawClinics) ? rawClinics : [];
  const allDoctors = Array.isArray(rawDoctors) ? rawDoctors : [];
  const technicians = Array.isArray(rawTechnicians) ? rawTechnicians : [];
  const priceItems = Array.isArray(rawPriceItems) ? rawPriceItems : [];
  const serviceCosts = Array.isArray(rawServiceCosts) ? rawServiceCosts : [];
  const orderTemplates = Array.isArray(rawOrderTemplates) ? rawOrderTemplates : [];
  const allTechServices = Array.isArray(rawTechServices) ? rawTechServices : [];

  const isDataLoading = clinicsLoading || doctorsLoading || techniciansLoading || priceItemsLoading;

  const toothTypes = useMemo(() => {
    let types = [];
    if (!orderTemplates.length) {
      types = [
        { label: 'К', title: 'Коронка', color: '#3b82f6', linked_service_id: null },
        { label: 'КМ', title: 'Коронка металокерамічна', color: '#6366f1', linked_service_id: null },
        { label: 'КК', title: 'Куксова вкладка', color: '#8b5cf6', linked_service_id: null },
        { label: 'Вк', title: 'Вінір керамічний', color: '#f59e0b', linked_service_id: null },
        { label: 'Нк', title: 'Накладка керамічна', color: '#f97316', linked_service_id: null },
        { label: 'Фн', title: 'Фіксація нарізна', color: '#ef4444', linked_service_id: null },
        { label: 'Мс', title: 'Місток стоматологічний', color: '#ec4899', linked_service_id: null },
        { label: 'КВ', title: 'Тимчасова коронка', color: '#06b6d4', linked_service_id: null },
      ];
    } else {
      types = orderTemplates.map(t => ({
        label: t.color_label || '?',
        title: t.color_title || 'Послуга',
        color: t.color_hex || '#3b82f6',
        linked_service_id: t.linked_service_id ? String(t.linked_service_id) : null
      }));
    }
    return types.filter(t => t.linked_service_id && priceItems.some(pi => String(pi.id) === t.linked_service_id));
  }, [orderTemplates, priceItems]);

  const handleToothClick = (toothNum) => {
    setActiveColoringTooth(toothNum);

    setForm(f => {
      const currentItems = f.items || [];
      const linkedServiceId = selectedTypeColor?.linked_service_id;

      const existingItemIndex = currentItems.findIndex(item =>
        String(item.teeth_numbers) === String(toothNum) &&
        String(item.price_item_id) === String(linkedServiceId)
      );

      let newItems;
      if (existingItemIndex > -1) {
        newItems = currentItems.filter((_, idx) => idx !== existingItemIndex);
      } else {
        const realPriceItem = priceItems.find(p => p && String(p.id) === String(linkedServiceId));
        const basePrice = realPriceItem ? parseFloat(realPriceItem.client_price || 0) : 0;
        const currency = realPriceItem?.price_currency || 'UAH';
        const discount = (doctorDiscount > 0 && doctorDiscount < 100) ? doctorDiscount : 0;
        const discountedPrice = basePrice * (1 - discount / 100);

        const newItem = {
          id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
          date: new Date().toISOString(),
          price_item_id: realPriceItem?.id ? realPriceItem.id.toString() : 'none',
          technician_service_id: 'none',
          service_name: realPriceItem?.name
            ? `${realPriceItem.name} (Зуб ${toothNum})`
            : `${selectedTypeColor?.title || 'Послуга'} (Зуб ${toothNum})`,
          category: realPriceItem?.category || '',
          teeth_numbers: String(toothNum),
          quantity: 1,
          unit_price: Math.round(discountedPrice * 100) / 100,
          technician_pay: realPriceItem?.technician_pay || 0,
          total: Math.round(discountedPrice * 100) / 100,
          price_currency: currency,
          color_hex: selectedTypeColor?.color || '#3b82f6'
        };
        newItems = [...currentItems, newItem];
      }

      const newTeeth = [...new Set(newItems
        .map(i => i.teeth_numbers)
        .filter(Boolean)
        .map(t => parseInt(t, 10))
        .filter(t => !isNaN(t))
      )];

      return { ...f, selected_teeth: newTeeth, items: newItems };
    });
  };

  useEffect(() => {
    if (toothTypes.length > 0 && !selectedTypeColor) {
      setSelectedTypeColor(toothTypes[0]);
    }
  }, [toothTypes, selectedTypeColor]);

  const dynamicTeethColors = useMemo(() => {
    const colorsObj = {};
    if (Array.isArray(form.items)) {
      form.items.forEach(item => {
        if (item && item.teeth_numbers) {
          const tNum = item.teeth_numbers.toString();
          let colorToUse = null;
          const template = toothTypes.find(t => t && t.linked_service_id && String(t.linked_service_id) === String(item.price_item_id));

          if (template?.color) colorToUse = template.color;
          else if (item.color_hex) colorToUse = item.color_hex;
          else {
            const pi = priceItems.find(p => String(p.id) === String(item.price_item_id));
            colorToUse = pi?.color_hex || '#3b82f6';
          }

          if (!colorsObj[tNum]) colorsObj[tNum] = { colors: [] };
          if (!colorsObj[tNum].colors.includes(colorToUse)) colorsObj[tNum].colors.push(colorToUse);
        }
      });
    }
    return colorsObj;
  }, [form.items, toothTypes, priceItems]);

  const currentTechServices = useMemo(() => {
    if (form.technician_id === 'none') return [];
    return allTechServices.filter(s => s && String(s.technician_id) === String(form.technician_id));
  }, [allTechServices, form.technician_id]);

  const filteredDoctors = useMemo(() => {
    if (!form.clinic_id || form.clinic_id === 'none') return allDoctors.filter(Boolean);
    return allDoctors.filter(d => d && String(d.clinic_id) === String(form.clinic_id));
  }, [allDoctors, form.clinic_id]);

  const selectedDoctor = useMemo(() => {
    if (!form.doctor_id || form.doctor_id === 'none') return null;
    return allDoctors.find(d => d && String(d.id) === String(form.doctor_id)) || null;
  }, [allDoctors, form.doctor_id]);

  const doctorDiscount = selectedDoctor?.discount_percent || 0;

  const categories = useMemo(() => {
    return [...new Set(priceItems.map(p => p?.category).filter(Boolean))].sort();
  }, [priceItems]);

  const filteredPriceItems = useMemo(() => {
    return selectedCategory ? priceItems.filter(p => p && p.category === selectedCategory) : priceItems;
  }, [priceItems, selectedCategory]);

  const handleDoctorChange = (doctorId) => {
    if (doctorId === 'none') {
      setForm(f => ({ ...f, doctor_id: 'none' }));
      return;
    }
    const selectedDoc = allDoctors.find(d => d && String(d.id) === String(doctorId));
    setForm(f => {
      const updatedClinicId = selectedDoc?.clinic_id ? String(selectedDoc.clinic_id) : f.clinic_id;
      return { ...f, doctor_id: doctorId, clinic_id: updatedClinicId };
    });
  };

  const removeItem = (index) => {
    const item = form.items[index];
    if (item?.is_paid) {
      alert('Ця послуга вже оплачена техніку, її неможливо видалити');
      return;
    }
    setForm(f => {
      const newItems = f.items.filter((_, i) => i !== index);
      const newTeeth = [...new Set(newItems
        .map(i => i.teeth_numbers)
        .filter(Boolean)
        .map(t => parseInt(t, 10))
        .filter(t => !isNaN(t))
      )];
      return { ...f, items: newItems, selected_teeth: newTeeth };
    });
  };

  const updateItem = (index, field, value) => {
    const item = form.items[index];
    if (item?.is_paid) {
      // Можна дозволити змінювати лише не-фінансові поля, якщо потрібно,
      // але зазвичай краще заблокувати все крім назви (якщо вона не впливає на ціну)
      return;
    }
    const updated = [...form.items];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'price_item_id' && value !== 'none') {
      const pi = priceItems.find(p => p && String(p.id) === String(value));
      if (pi) {
        const discountedPrice = pi.client_price * (1 - (doctorDiscount || 0) / 100);
        updated[index].service_name = pi.name;
        updated[index].category = pi.category || '';
        updated[index].unit_price = Math.round(discountedPrice * 100) / 100;
        updated[index].price_currency = pi.price_currency || 'UAH';

        if (!updated[index].technician_service_id || updated[index].technician_service_id === 'none') {
          updated[index].technician_pay = pi.technician_pay || 0;
        }

        const cost = serviceCosts.find(c => c && String(c.price_item_id) === String(value));
        if (cost) {
          updated[index].service_cost = cost;
          updated[index].cost_info = {
            material_costs: cost.material_costs || 0,
            technician_pay_total: updated[index].technician_pay,
            fixed_costs: cost.fixed_costs || 0,
          };
        }
      }
    }

    if (['quantity', 'unit_price'].includes(field)) {
      updated[index].total = (updated[index].quantity || 0) * (updated[index].unit_price || 0);
    }
    setForm(f => ({ ...f, items: updated }));
  };

  const updateToothShade = (toothNum, part, shade) => {
    setForm(f => {
      const currentShades = f.tooth_shades || {};
      const toothShade = currentShades[toothNum] || { neck: '', body: '', incisal: '' };
      return {
        ...f,
        tooth_shades: {
          ...currentShades,
          [toothNum]: { ...toothShade, [part]: shade }
        }
      };
    });
  };

  const currencyTotals = useMemo(() => {
    const totals = { UAH: 0, USD: 0, EUR: 0 };
    if (Array.isArray(form.items)) {
      form.items.forEach(i => {
        if (i) {
          const curr = i.price_currency || 'UAH';
          if (totals[curr] !== undefined) {
            totals[curr] += (i.total || 0);
          }
        }
      });
    }
    return totals;
  }, [form.items]);

  const parseCleanNumber = (val) => {
    if (!val) return 0;
    const clean = parseFloat(String(val).replace(/[^\d.-]/g, ''));
    return isNaN(clean) ? 0 : clean;
  };

  const manualDiscountVal = parseCleanNumber(form.discount);

  const finalTotalsByCurrency = useMemo(() => {
    const finalTotals = { UAH: 0, USD: 0, EUR: 0 };
    Object.entries(currencyTotals).forEach(([curr, sub]) => {
      finalTotals[curr] = manualDiscountVal > 0 ? sub * (1 - manualDiscountVal / 100) : sub;
    });
    return finalTotals;
  }, [currencyTotals, manualDiscountVal]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const clinic = clinics.find(c => c && String(c.id) === String(form.clinic_id));
    const doctor = allDoctors.find(d => d && String(d.id) === String(form.doctor_id));
    const technician = technicians.find(t => t && String(t.id) === String(form.technician_id));

    const techPay = Array.isArray(form.items) ? form.items.reduce((s, i) => s + ((i?.technician_pay || 0) * (i?.quantity || 0)), 0) : 0;
    const totalMaterials = Array.isArray(form.items) ? form.items.reduce((s, i) => s + ((i?.cost_info?.material_costs || 0) * (i?.quantity || 0)), 0) : 0;

    const cleanExpenses = form.expenses ? parseCleanNumber(form.expenses) : 0;
    const cleanDiscount = form.discount ? parseCleanNumber(form.discount) : 0;

    const safeParseId = (val) => {
      if (!val || val === 'none' || val === '') return null;
      if (/^\d+$/.test(String(val))) return parseInt(val, 10);
      return String(val);
    };

    const baseTotalAmount = finalTotalsByCurrency.UAH || Object.values(finalTotalsByCurrency).reduce((a, b) => a + b, 0);

    const payload = {
      ...form,
      clinic_id: safeParseId(form.clinic_id),
      doctor_id: safeParseId(form.doctor_id),
      technician_id: form.technician_id === 'none' ? null : form.technician_id,
      clinic_name: clinic?.name || 'Приватна практика',
      doctor_name: doctor?.full_name || 'Не вказано',
      doctor_discount: doctorDiscount,
      technician_name: technician?.full_name || 'Не вказано',
      total_amount: Number(baseTotalAmount) || 0,
      technician_total_pay: Number(techPay) || 0,
      net_profit: Number(baseTotalAmount - techPay - totalMaterials - cleanExpenses) || 0,
      patient_age: form.patient_age ? Number(form.patient_age) : null,
      expenses: cleanExpenses,
      discount: cleanDiscount,
      items: Array.isArray(form.items) ? form.items.map(i => i && ({
        ...i,
        price_item_id: safeParseId(i.price_item_id),
        technician_service_id: safeParseId(i.technician_service_id),
        price_currency: i.price_currency || 'UAH'
      })) : [],
      tooth_shades: JSON.stringify(form.tooth_shades || {})
    };

    onSubmit(payload);
  };

  if (isDataLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-0 min-h-[600px] overflow-x-auto">
      <div className="flex-1 bg-white p-4 sm:p-5 space-y-4 border-r border-gray-100 lg:border-r min-w-[320px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <label className="absolute -top-2 left-2 text-[10px] text-blue-500 bg-white px-1 z-10 font-medium">Оберіть клініку</label>
            <Select value={form.clinic_id} onValueChange={v => setForm({ ...form, clinic_id: v })}>
              <SelectTrigger className="h-10 border-gray-300 text-sm rounded-sm">
                <SelectValue placeholder="Оберіть клініку" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без прив'язки (приватна практика)</SelectItem>
                {clinics.map(c => c && <SelectItem key={c.id.toString()} value={c.id.toString()}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <label className="absolute -top-2 left-2 text-[10px] text-blue-500 bg-white px-1 z-10 font-medium">Оберіть лікаря</label>
            <Select value={form.doctor_id} onValueChange={handleDoctorChange}>
              <SelectTrigger className="h-10 border-gray-300 text-sm rounded-sm">
                <SelectValue placeholder="Оберіть лікаря" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Оберіть лікаря</SelectItem>
                {filteredDoctors.map(d => d && (
                  <SelectItem key={d.id.toString()} value={d.id.toString()}>
                    {d.full_name} {d.discount_percent > 0 ? `(−${d.discount_percent}%)` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <label className="absolute -top-2 left-2 text-[10px] text-blue-500 bg-white px-1 z-10 font-medium">Оберіть техніка</label>
            <Select value={form.technician_id} onValueChange={v => setForm({ ...form, technician_id: v })}>
              <SelectTrigger className="h-10 border-gray-300 text-sm rounded-sm">
                <SelectValue placeholder="Не вказано" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не вказано</SelectItem>
                {technicians.map(t => t && (
                  <SelectItem key={t.id.toString()} value={t.id.toString()}>{t.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Input
              value={form.patient_name}
              onChange={e => setForm({ ...form, patient_name: e.target.value })}
              placeholder="Прізвище та ім'я пацієнта"
              className="h-10 border-gray-300 text-sm rounded-sm"
            />
          </div>
          <div className="relative">
             <label className="absolute -top-2 left-2 text-[10px] text-blue-500 bg-white px-1 z-10 font-medium">Загальний колір (VITA або ручний)</label>
             <div className="flex gap-1">
               <Select value={VITA_SHADES.includes(form.tooth_color) ? form.tooth_color : 'manual'} onValueChange={v => setForm({ ...form, tooth_color: v === 'manual' ? (form.tooth_color || '') : v })}>
                  <SelectTrigger className="h-10 border-gray-300 text-sm rounded-sm flex-1">
                    <SelectValue placeholder="Оберіть колір" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не вказано</SelectItem>
                    {VITA_SHADES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    <SelectItem value="manual">Свій варіант...</SelectItem>
                  </SelectContent>
               </Select>
               {(!VITA_SHADES.includes(form.tooth_color) || form.tooth_color === '') && (
                 <Input
                   value={form.tooth_color}
                   onChange={e => setForm({ ...form, tooth_color: e.target.value })}
                   placeholder="Впишіть колір..."
                   className="h-10 w-32 border-gray-300 text-sm rounded-sm"
                 />
               )}
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-blue-600">Оберіть тип зуба:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {toothTypes.map(tc => tc && (
              <button
                key={tc.label}
                type="button"
                onClick={() => setSelectedTypeColor(tc)}
                title={tc.title}
                className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center transition-all duration-150 shadow-sm"
                style={{
                  backgroundColor: tc.color || '#3b82f6',
                  opacity: selectedTypeColor?.label === tc.label ? 1 : 0.55,
                  transform: selectedTypeColor?.label === tc.label ? 'scale(1.15)' : 'scale(1)',
                  outline: selectedTypeColor?.label === tc.label ? `2px solid ${tc.color || '#3b82f6'}` : 'none',
                  outlineOffset: '2px',
                }}
              >
                {tc.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ml-auto text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
            onClick={() => setForm(f => ({ ...f, selected_teeth: [], items: f.items.filter(item => item && !item.teeth_numbers) }))}
          >
            <RotateCcw className="w-3 h-3" /> Очистити
          </button>
        </div>

        <div className="border border-gray-200 rounded-md bg-gray-50/60 overflow-x-auto overflow-y-hidden touch-pan-x">
          <div className="min-w-max px-2 py-3">
            <ToothChart
              selectedTeeth={form.selected_teeth || []}
              teethColors={dynamicTeethColors}
              onChange={handleToothClick}
              color={selectedTypeColor?.color || '#3b82f6'}
            />
          </div>
        </div>

        <div className="space-y-3 bg-blue-50/30 p-3 rounded-lg border border-blue-100">
          <div className="flex items-center justify-between">
             <span className="text-xs font-bold text-blue-600 uppercase flex items-center gap-1.5">
               <Palette className="w-3.5 h-3.5" /> Вибрані кольори VITA:
             </span>
          </div>

          {Object.keys(form.tooth_shades || {}).some(t => form.tooth_shades[t].neck || form.tooth_shades[t].incisal) && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(form.tooth_shades).map(([tooth, shades]) => (
                (shades.neck || shades.incisal) && (
                  <button
                    key={`summary-${tooth}`}
                    type="button"
                    onClick={() => setActiveColoringTooth(tooth)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all ${
                      activeColoringTooth === tooth
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg scale-105'
                      : 'bg-white border-white text-slate-700 shadow-sm hover:border-blue-200'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${activeColoringTooth === tooth ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-600'}`}>
                      {tooth}
                    </span>
                    <div className="text-left leading-[1.1]">
                      {shades.neck && <div className="text-[9px] font-bold uppercase">Ш: {shades.neck}</div>}
                      {shades.incisal && <div className="text-[9px] font-bold uppercase">К: {shades.incisal}</div>}
                    </div>
                  </button>
                )
              ))}
            </div>
          )}

          {activeColoringTooth && (
            <div className="bg-slate-50 border-2 border-blue-100 rounded-lg p-3 space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-blue-700 flex items-center gap-2">
                  <Palette className="w-4 h-4" /> Розколірка VITA для зуба {activeColoringTooth}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveColoringTooth(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold"
                >ЗАКРИТИ ПАНЕЛЬ</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Шийка (Neck)</label>
                  <div className="grid grid-cols-5 gap-1">
                    {VITA_SHADES.map(shade => (
                      <button
                        key={`neck-${shade}`}
                        type="button"
                        onClick={() => updateToothShade(activeColoringTooth, 'neck', shade)}
                        className={`h-7 text-[10px] font-bold rounded border transition-all ${
                          form.tooth_shades?.[activeColoringTooth]?.neck === shade
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-105'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                        }`}
                      >
                        {shade}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Різцевий край (Incisal)</label>
                  <div className="grid grid-cols-5 gap-1">
                    {VITA_SHADES.map(shade => (
                      <button
                        key={`incisal-${shade}`}
                        type="button"
                        onClick={() => updateToothShade(activeColoringTooth, 'incisal', shade)}
                        className={`h-7 text-[10px] font-bold rounded border transition-all ${
                          form.tooth_shades?.[activeColoringTooth]?.incisal === shade
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-105'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                        }`}
                      >
                        {shade}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 border-t pt-2">
          <span className="text-xs font-semibold text-gray-600 block">1. Додати базову послугу клініки:</span>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('')}
                className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
                  selectedCategory === '' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Все
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
                    selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Select value={selectedPriceItemId} onValueChange={setSelectedPriceItemId}>
                <SelectTrigger className="h-10 border-gray-300 text-sm rounded-sm bg-white">
                  <SelectValue placeholder="Оберіть базову послугу" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Оберіть базову послугу</SelectItem>
                  {filteredPriceItems.map(p => p && p.id && (
                    <SelectItem key={p.id.toString()} value={p.id.toString()}>
                      {p.name} — {p.client_price || 0} {getCurrencyLabel(p.price_currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              onClick={() => {
                if (selectedPriceItemId && selectedPriceItemId !== 'none') {
                  const pi = priceItems.find(p => p && String(p.id) === String(selectedPriceItemId));
                  if (pi) {
                    const discountedPrice = pi.client_price * (1 - (doctorDiscount || 0) / 100);
                    const newItem = {
                      id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
                      date: new Date().toISOString(),
                      price_item_id: pi.id.toString(),
                      technician_service_id: 'none',
                      service_name: pi.name,
                      category: pi.category || '',
                      teeth_numbers: '',
                      quantity: 1,
                      unit_price: Math.round(discountedPrice * 100) / 100,
                      technician_pay: pi.technician_pay || 0,
                      total: Math.round(discountedPrice * 100) / 100,
                      price_currency: pi.price_currency || 'UAH',
                    };
                    setForm(f => ({ ...f, items: [...f.items, newItem] }));
                  }
                }
              }}
              className="h-10 px-3 rounded-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white flex items-center justify-center font-medium text-sm"
            >
              <Plus className="w-4 h-4 mr-1" /> Додати
            </button>
          </div>
        </div>

        {form.technician_id !== 'none' && currentTechServices.length > 0 && (
          <div className="space-y-2 border-t pt-3 bg-slate-50/50 p-2 rounded-sm border border-dashed">
            <div className="flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold text-gray-700">2. Додати окрему послугу техніка:</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select value={selectedTechServiceId} onValueChange={setSelectedTechServiceId}>
                  <SelectTrigger className="h-10 border-gray-300 text-sm rounded-sm bg-white">
                    <SelectValue placeholder="Оберіть особисту послугу техніка" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Оберіть особисту послугу техніка</SelectItem>
                    {currentTechServices.map(ts => ts && (
                      <SelectItem key={ts.id.toString()} value={ts.id.toString()}>
                        {ts.service_name} — {ts.technician_pay || 0} {getCurrencyLabel(ts.price_currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-20">
                <Label className="text-xs">К-сть</Label>
                <Input type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} className="h-8" />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (selectedTechServiceId && selectedTechServiceId !== 'none') {
                    const ts = currentTechServices.find(s => s && String(s.id) === String(selectedTechServiceId));
                    if (ts) {
                      const newItem = {
                        id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
                        date: new Date().toISOString(),
                        price_item_id: 'none',
                        technician_service_id: ts.id.toString(),
                        service_name: `[Технік] ${ts.service_name}`,
                        category: '',
                        teeth_numbers: '',
                        quantity: qty,
                        unit_price: 0,
                        total: 0,
                        technician_pay: ts.technician_pay || 0,
                        price_currency: ts.price_currency || 'UAH',
                        cost_info: {
                          material_costs: ts.material_costs || 0,
                          technician_pay_total: ts.technician_pay || 0
                        }
                      };
                      setForm({ ...form, items: [...form.items, newItem] });
                    }
                  }
                }}
                className="h-10 px-3 rounded-sm bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white flex items-center justify-center font-medium text-sm"
              >
                <Plus className="w-4 h-4 mr-1" /> Додати техніку
              </button>
            </div>
          </div>
        )}

        {form.items.length > 0 && (
          <div className="space-y-2 border-t pt-2 overflow-x-auto">
            <div className="min-w-[400px]">
              {form.items.map((item, idx) => item && (
                <div key={idx} className="border border-gray-200 rounded-sm p-2 bg-white flex flex-col gap-2 shadow-sm mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-sm font-medium text-gray-700 truncate flex items-center gap-2">
                      {item.service_name}
                      {item.is_paid && <Lock className="w-3 h-3 text-emerald-500" title="Оплачено техніку" />}
                    </div>
                    {!item.is_paid && (
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    <div>
                      <span className="text-[9px] text-gray-400">Зуби</span>
                      <Input value={item.teeth_numbers || ''} disabled className="h-7 text-xs rounded-sm px-1.5 bg-gray-50 text-gray-500" />
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400">К-ть</span>
                      <Input type="number" min="1" value={item.quantity ?? 1} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} disabled={item.is_paid} className={`h-7 text-xs rounded-sm px-1.5 ${item.is_paid ? 'bg-gray-50' : ''}`} />
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400">Ціна ({getCurrencyLabel(item.price_currency)})</span>
                      <Input type="number" min="0" step="0.01" value={item.unit_price ?? 0} onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))} disabled={item.is_paid} className={`h-7 text-xs rounded-sm px-1.5 ${item.is_paid ? 'bg-gray-50' : ''}`} />
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400">Сума ({getCurrencyLabel(item.price_currency)})</span>
                      <Input value={(item.total ?? 0).toFixed(2)} disabled className="h-7 text-xs bg-gray-50 font-semibold rounded-sm px-1.5" />
                    </div>
                  </div>
                  {item.date && (
                    <div className="text-[8px] text-gray-400 flex justify-between items-center px-1">
                      <span>Внесено: {item.date.includes('T') ? format(parseISO(item.date), 'dd.MM.yyyy HH:mm', { locale: uk }) : item.date}</span>
                      {item.is_paid && <span className="text-emerald-600 font-bold uppercase">Виплачено</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          <label className="absolute -top-2 left-2 text-[10px] text-blue-500 bg-white px-1 z-10 font-medium">Статус оплати</label>
          <Select value={form.payment_status || 'Борг'} onValueChange={v => setForm({ ...form, payment_status: v })}>
            <SelectTrigger className="h-10 border-gray-300 text-sm rounded-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Оплачено">✅ Оплачено</SelectItem>
              <SelectItem value="Частково">🟡 Частково</SelectItem>
              <SelectItem value="Борг">🔴 Борг</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative flex items-center border border-gray-300 rounded-sm h-10 px-3 gap-2 bg-white">
            <DollarSign className="w-4 h-4 text-gray-400 shrink-0" />
            <Input value={form.expenses || ''} onChange={e => setForm({ ...form, expenses: e.target.value })} placeholder="Витрати (тільки цифри)" className="border-0 h-8 p-0 text-sm focus-visible:ring-0 bg-transparent" />
          </div>
          <div className="relative flex items-center border border-gray-300 rounded-sm h-10 px-3 gap-2 bg-white">
            <Tag className="w-4 h-4 text-gray-400 shrink-0" />
            <Input value={form.discount || ''} onChange={e => setForm({ ...form, discount: e.target.value })} placeholder="Знижка (наприклад: 5 або -10)" className="border-0 h-8 p-0 text-xs focus-visible:ring-0 bg-transparent" />
          </div>
        </div>

        <div className="relative flex items-start border border-gray-300 rounded-sm min-h-[40px] px-3 py-2 gap-2 bg-white">
          <StickyNote className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <Textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Замітки до роботи" rows={2} className="border-0 p-0 text-sm focus-visible:ring-0 resize-none bg-transparent flex-1 min-h-0" />
        </div>

        <FileUploader files={form.file_urls || []} onChange={file_urls => setForm({ ...form, file_urls })} />

        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <label className="absolute -top-2 left-2 text-[10px] text-blue-500 bg-white px-1 z-10 font-medium">Дата створення</label>
            <Input type="date" value={form.creation_date} onChange={e => setForm({ ...form, creation_date: e.target.value })} className="h-10 border-gray-300 rounded-sm text-sm" />
          </div>
          <div className="relative">
            <label className="absolute -top-2 left-2 text-[10px] text-red-500 bg-white px-1 z-10 font-bold">Дата здачі *</label>
            <Input
              type="date"
              value={form.due_date || ''}
              onChange={e => setForm({ ...form, due_date: e.target.value })}
              required
              className="h-10 border-red-300 focus:border-red-500 rounded-sm text-sm bg-red-50/20"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 lg:hidden">
          <Button type="button" onClick={onCancel} variant="outline" className="h-9 text-sm flex-1">Скасувати</Button>
          <Button type="submit" disabled={isSubmitting} className="h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white flex-1">
            {isSubmitting ? 'Збереження...' : 'Зберегти'}
          </Button>
        </div>
      </div>

      <div className="hidden lg:flex w-full lg:w-72 bg-gray-50 border-l border-gray-200 flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Підсумок інвойсу</span>
        </div>

        <div className="flex-1 p-4 space-y-2 overflow-y-auto">
          {form.items.length === 0 && <p className="text-xs text-gray-400 text-center py-8">Додайте послуги до наряду</p>}
          {form.items.map((item, idx) => item && (
            <div key={idx} className="flex justify-between items-start text-xs">
              <span className="text-gray-600 flex-1 mr-2 leading-tight">{item.service_name} ×{item.quantity ?? 1}</span>
              <span className="font-semibold text-gray-800">
                {(item.total || 0).toFixed(2)} {getCurrencyLabel(item.price_currency)}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 px-4 py-3 space-y-2">
          <div className="space-y-1 text-xs text-gray-500">
            <span>Проміжний підсумок:</span>
            <div className="text-right font-medium text-gray-700">
              {Object.entries(currencyTotals).map(([curr, sum]) => sum > 0 && <div key={curr}>{getCurrencySymbol(curr)} {sum.toFixed(2)}</div>)}
            </div>
          </div>

          <div className="pt-2 border-t border-gray-200 font-bold">
            <span className="text-sm block mb-1">ЗАГАЛОМ:</span>
            <div className="text-right text-base text-blue-600">
              {Object.entries(finalTotalsByCurrency).map(([curr, sum]) => sum > 0 && <div key={curr}>{getCurrencySymbol(curr)} {sum.toFixed(2)}</div>)}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-4 py-3 flex justify-end gap-1">
          <Button type="button" onClick={onCancel} variant="outline" className="h-8 text-xs">Скасувати</Button>
          <Button type="submit" disabled={isSubmitting} className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">Зберегти</Button>
        </div>
      </div>
    </form>
  );
}
