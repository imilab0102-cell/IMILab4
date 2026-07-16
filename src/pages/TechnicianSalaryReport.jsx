import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { format, parseISO, addDays } from 'date-fns'
import { uk } from 'date-fns/locale'
import { ArrowLeft, Calendar, Loader2, CheckCircle2, History, Wallet, X, Eye, AlertCircle, FlaskConical, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const CANCELLED_STATUS = 'Скасований'
const DATE_FIELDS = [
  { value: 'due_date', label: 'Дедлайн (due_date)' },
  { value: 'creation_date', label: 'Дата створення' },
  { value: 'completion_date', label: 'Дата завершення' },
]

// Безпечне отримання масиву items
function getItems(order) {
  if (!order) return []
  let items = order.items
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items)
    } catch {
      items = []
    }
  }
  if (!Array.isArray(items)) return []

  // Migration: ensure each item has an ID and a date
  return items.map(item => ({
    ...item,
    id: item.id || (Math.random().toString(36).substring(2, 9) + Date.now().toString(36)),
    date: (item.date || order.creation_date || '2024-01-01').slice(0, 10)
  }))
}

function calcOrderSalary(order) {
  if (!order) return 0

  // Отримуємо список послуг
  const items = getItems(order)

  // Пріоритет: якщо в наряді є items, розраховуємо зарплату за ними.
  // Це надійніше, бо technician_total_pay у базі міг бути розрахований некоректно (наприклад, з урахуванням курсу валют)
  if (items.length > 0) {
    const totalFromItems = items.reduce((sum, item) => {
      const pay = parseFloat(item.technician_price) || parseFloat(item.technician_pay) || 0
      const qty = parseInt(item.quantity) || 1
      return sum + pay * qty
    }, 0)

    // Якщо розрахунок за айтемами дав результат > 0, використовуємо його
    if (totalFromItems > 0) return totalFromItems
  }

  // Фолбек: якщо айтемів немає або вони пусті, беремо збережене значення з бази
  if (order.technician_total_pay !== undefined && order.technician_total_pay !== null) {
    return parseFloat(order.technician_total_pay) || 0
  }

  return 0
}

function calcExternalOrderSalary(order) {
  if (!order) return 0
  const items = getItems(order)
  return items.reduce((sum, item) => {
    const pay = parseFloat(item.technician_pay) || parseFloat(item.technician_price) || 0
    const qty = parseInt(item.quantity) || 1
    return sum + pay * qty
  }, 0)
}

export default function TechnicianSalaryReport() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [selectedTechnicianId, setSelectedTechnicianId] = useState('')
  const [dateField, setDateField] = useState('due_date')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showReport, setShowReport] = useState(false)
  const [startDateTouched, setStartDateTouched] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState(null)

  // Поля для ручного коригування
  const [manualAdjustments, setManualAdjustments] = useState([])
  const [adjDesc, setAdjDesc] = useState('')
  const [adjAmount, setAdjAmount] = useState('')

  const handleAddAdjustment = () => {
    const amt = parseFloat(adjAmount)
    if (!adjDesc || isNaN(amt)) return
    setManualAdjustments([...manualAdjustments, {
      id: 'adj-' + Date.now(),
      description: adjDesc,
      amount: amt,
      date: format(new Date(), 'yyyy-MM-dd')
    }])
    setAdjDesc('')
    setAdjAmount('')
  }

  const removeAdjustment = (id) => {
    setManualAdjustments(manualAdjustments.filter(a => a.id !== id))
  }

  const { data: technicians = [], isLoading: techLoading } = useQuery({
    queryKey: ['technicians'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('technician')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return data || []
    },
  })

  const { data: paymentHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['salaryPayments', selectedTechnicianId],
    queryFn: async () => {
      if (!selectedTechnicianId) return []
      const { data, error } = await supabase
        .from('salary_payment')
        .select('id, period_start, period_end, total_amount, orders_count, paid_at, note')
        .eq('technician_id', selectedTechnicianId)
        .order('period_end', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!selectedTechnicianId,
  })

  const { data: paidOrderRows = [] } = useQuery({
    queryKey: ['paidOrders', selectedTechnicianId],
    queryFn: async () => {
      if (!selectedTechnicianId) return []
      // We still query this for backward compatibility, but we will also check item-level flags
      const { data, error } = await supabase
        .from('salary_payment_order')
        .select('work_order_id, amount')
        .eq('technician_id', selectedTechnicianId)
      if (error) throw error
      return data || []
    },
    enabled: !!selectedTechnicianId,
  })

  const paidOrderIds = useMemo(
    () => new Set(paidOrderRows.map((r) => r.work_order_id)),
    [paidOrderRows]
  )

  const { data: dbAdjustments = [], refetch: refetchDbAdjustments } = useQuery({
    queryKey: ['technician-adjustments', selectedTechnicianId],
    queryFn: async () => {
      if (!selectedTechnicianId) return []
      const { data, error } = await supabase
        .from('technician_adjustment')
        .select('*')
        .eq('technician_id', selectedTechnicianId)
        .eq('is_paid', false)
      if (error) throw error
      return data || []
    },
    enabled: !!selectedTechnicianId,
  })

  const { data: allOrders = [], refetch: refetchAllOrders } = useQuery({
    queryKey: ['allOrders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('WorkOrder')
        .select('id, order_number, technician_id, patient_name, creation_date, status')
        .order('creation_date', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  useEffect(() => {
    if (!selectedTechnicianId) return
    if (startDateTouched) return
    if (paymentHistory.length > 0) {
      const last = paymentHistory[0].period_end
      setStartDate(format(addDays(parseISO(last), 1), 'yyyy-MM-dd'))
    }
  }, [selectedTechnicianId, paymentHistory, startDateTouched])

  const {
    data: orders = [],
    isLoading: ordersLoading,
    refetch,
    error: ordersError,
  } = useQuery({
    queryKey: ['salaryReportOrders', selectedTechnicianId, startDate, endDate],
    queryFn: async () => {
      if (!selectedTechnicianId || !startDate || !endDate) return []

      const tech = technicians.find(t => String(t.id) === selectedTechnicianId);
      const techName = tech?.full_name;

      console.log(`🔍 Запит нарядів для: ${techName} (ID: ${selectedTechnicianId})`);

      // 1. Спочатку пробуємо знайти за ID
      let { data, error } = await supabase
        .from('WorkOrder')
        .select('id, order_number, due_date, creation_date, completion_date, status, items, patient_name, clinic_name, technician_total_pay, technician_id, technician_name')
        .eq('technician_id', selectedTechnicianId)
        .order('creation_date', { ascending: false })
        .limit(1000);

      // 2. Якщо за ID нічого немає, пробуємо за іменем (для старих записів)
      if (!error && (!data || data.length === 0) && techName) {
        console.log(`ℹ️ По ID нічого не знайдено, пробуємо за іменем: ${techName}`);
        const { data: byName, error: errName } = await supabase
          .from('WorkOrder')
          .select('id, order_number, due_date, creation_date, completion_date, status, items, patient_name, clinic_name, technician_total_pay, technician_id, technician_name')
          .eq('technician_name', techName)
          .order('creation_date', { ascending: false })
          .limit(1000);

        if (!errName) data = byName;
      }

      if (error) {
        console.error('❌ Помилка WorkOrder:', error);
        throw error;
      }

      const filtered = (data || []).filter(o => !o.status?.toLowerCase().includes('скасов'));
      console.log(`✅ Отримано нарядів: ${filtered.length}`);
      return filtered;
    },
    enabled: false,
    retry: 1,
  })

  const {
    data: externalOrders = [],
    isLoading: externalLoading,
    refetch: refetchExternal,
    error: externalError,
  } = useQuery({
    queryKey: ['salaryReportExternal', selectedTechnicianId, startDate, endDate],
    queryFn: async () => {
      if (!selectedTechnicianId || !startDate || !endDate) return []

      let from = startDate
      let to = endDate
      if (startDate > endDate) { from = endDate; to = startDate }

      const { data, error } = await supabase
        .from('external_lab_order')
        .select('id, order_date, lab_name, items, total_amount, technician_paid_amount, payment_status, status, notes')
        .eq('technician_id', selectedTechnicianId)
        .gte('order_date', from)
        .lte('order_date', to)
        .order('order_date', { ascending: true })

      if (error) {
        console.error('❌ Помилка запиту external_lab_order:', error)
        throw error
      }

      console.log(`✅ Отримано ${data?.length || 0} зовнішніх замовлень за період`)
      return data || []
    },
    enabled: false,
    retry: 1,
  })

  const handleGenerate = () => {
    if (!selectedTechnicianId) { alert('Оберіть техніка'); return }
    if (!startDate || !endDate) { alert('Виберіть період'); return }
    setShowReport(true)
    refetch()
    refetchExternal()
  }

  const allOrdersWithSalary = useMemo(() => {
    let from = startDate
    let to = endDate
    if (startDate > endDate) { from = endDate; to = startDate }

    console.log(`🔄 Обробка періоду: ${from} - ${to}. Наряди: ${orders.length}, Зовн: ${externalOrders.length}`);

    const orderItems = []
    orders.forEach(order => {
      const items = getItems(order)

      // Якщо в наряді немає послуг (старий формат), показуємо його цілком за датою створення
      if (items.length === 0) {
        const orderDate = (order.creation_date || '2024-01-01').slice(0, 10)
        const pay = parseFloat(order.technician_total_pay) || 0
        if (orderDate >= from && orderDate <= to && pay > 0) {
          orderItems.push({
            ...order,
            _type: 'Наряд (старий)',
            _salary: pay,
            _paid: paidOrderIds.has(order.id),
            _date: orderDate,
            _sourceId: order.id,
            _sourceType: 'WorkOrder',
          })
        }
        return;
      }

      // Якщо послуги є, розбиваємо по кожній послузі
      items.forEach(item => {
        const itemDate = item.date
        const pay = parseFloat(item.technician_price) || parseFloat(item.technician_pay) || 0

        if (itemDate >= from && itemDate <= to && pay > 0) {
          orderItems.push({
            ...order,
            _type: 'Наряд',
            _salary: pay * (parseInt(item.quantity) || 1),
            _paid: item.is_paid || item.salary_payment_id || paidOrderIds.has(order.id),
            _date: itemDate,
            _sourceId: order.id,
            _itemId: item.id,
            _itemName: item.service_name || item.name,
            _sourceType: 'WorkOrder',
          })
        }
      })
    })

    const externalItems = externalOrders.map((o) => {
      const salary = calcExternalOrderSalary(o)
      const paid = salary > 0 && (o.technician_paid_amount || 0) >= salary
      return {
        ...o,
        _type: 'Зовн.лаб.',
        _salary: salary,
        _paid: paid,
        _date: o.order_date,
        _sourceId: o.id,
        _sourceType: 'ExternalLabOrder',
        clinic_name: o.lab_name || 'Зовнішня лабораторія',
        patient_name: '—',
        order_number: o.id,
        status: o.status || '—',
        due_date: o.order_date,
        technician_paid_amount: o.technician_paid_amount || 0,
      }
    })

    const adjustmentItems = manualAdjustments.map((adj) => ({
      _type: 'Коригування (тимчас)',
      _salary: adj.amount,
      _paid: false,
      _date: adj.date,
      _sourceId: adj.id,
      _itemName: adj.description,
      _sourceType: 'ManualAdjustment',
      patient_name: '—',
      order_number: '—',
      status: 'Очікує',
      id: adj.id
    }))

    const dbAdjustmentItems = dbAdjustments.map((adj) => ({
      ...adj,
      _type: 'Коригування (профіль)',
      _salary: adj.amount,
      _paid: false,
      _date: adj.created_at.slice(0, 10),
      _sourceId: adj.id,
      _itemName: adj.description,
      _sourceType: 'DbAdjustment',
      patient_name: '—',
      order_number: '—',
      status: 'Очікує',
    }))

    const result = [...orderItems, ...externalItems, ...adjustmentItems, ...dbAdjustmentItems].sort((a, b) => {
      if (!a._date) return 1
      if (!b._date) return -1
      return a._date.localeCompare(b._date)
    })

    console.log(`📊 Результат після фільтрації: ${result.length} рядків`);
    return result;
  }, [orders, externalOrders, paidOrderIds, startDate, endDate])

  const unpaidOrders = allOrdersWithSalary.filter((o) => !o._paid && o._salary > 0)
  const paidOrdersInPeriod = allOrdersWithSalary.filter((o) => o._paid)

  const totalUnpaid = unpaidOrders.reduce((s, o) => s + o._salary, 0)
  const totalPaidInPeriod = paidOrdersInPeriod.reduce((s, o) => s + o._salary, 0)

  const technicianName = technicians.find((t) => String(t.id) === selectedTechnicianId)?.full_name || ''

  // === ОНОВЛЕНА МУТАЦІЯ НАРАХУВАННЯ ===
  const accrueMutation = useMutation({
    mutationFn: async () => {
      if (unpaidOrders.length === 0) throw new Error('Немає неоплачених записів для нарахування')

      const periodStart = startDate <= endDate ? startDate : endDate
      const periodEnd = startDate <= endDate ? endDate : startDate

      const unpaidWorkOrders = unpaidOrders.filter(o => o._sourceType === 'WorkOrder')
      const unpaidExternal = unpaidOrders.filter(o => o._sourceType === 'ExternalLabOrder')
      const unpaidManual = unpaidOrders.filter(o => ['ManualAdjustment', 'DbAdjustment'].includes(o._sourceType))

      const total = unpaidOrders.reduce((s, o) => s + o._salary, 0)

      const manualNotes = unpaidManual.map(a => `${a._itemName} (${a._salary} ₴)`).join(', ')
      const notePrefix = `Нараховано за період з ${periodStart} по ${periodEnd}`
      const noteDetails = ` (наряди: ${unpaidWorkOrders.length}, зовн.лаб.: ${unpaidExternal.length}${manualNotes ? ', коригування: ' + manualNotes : ''})`

      // 1. Створюємо запис виплати
      const { data: payment, error: payErr } = await supabase
        .from('salary_payment')
        .insert([{
          technician_id: selectedTechnicianId,
          period_start: periodStart,
          period_end: periodEnd,
          total_amount: total,
          orders_count: unpaidOrders.length,
          note: notePrefix + noteDetails,
        }])
        .select()
        .single()
      if (payErr) throw payErr

      // 1.5 Оновлюємо DbAdjustments
      const dbAdjIds = unpaidOrders.filter(o => o._sourceType === 'DbAdjustment').map(o => o.id)
      if (dbAdjIds.length > 0) {
        const { error: updAdjErr } = await supabase
          .from('technician_adjustment')
          .update({ is_paid: true, salary_payment_id: payment.id })
          .in('id', dbAdjIds)
        if (updAdjErr) throw updAdjErr
      }

      // 2. Оновлюємо наряди (маркуємо айтеми як оплачені)
      if (unpaidWorkOrders.length > 0) {
        // Групуємо айтеми по нарядах
        const ordersToUpdate = {}
        unpaidWorkOrders.forEach(item => {
          if (!ordersToUpdate[item.id]) {
            ordersToUpdate[item.id] = {
              id: item.id,
              items: getItems(orders.find(o => o.id === item.id)),
              totalAmount: 0
            }
          }
          ordersToUpdate[item.id].totalAmount += item._salary
          // Маркуємо конкретний айтем
          const targetItem = ordersToUpdate[item.id].items.find(i => i.id === item._itemId)
          if (targetItem) {
            targetItem.is_paid = true
            targetItem.paid_at = new Date().toISOString()
            targetItem.salary_payment_id = payment.id
          }
        })

        // Виконуємо оновлення в базі для кожного наряду
        for (const orderId in ordersToUpdate) {
          const { error: updErr } = await supabase
            .from('WorkOrder')
            .update({ items: JSON.stringify(ordersToUpdate[orderId].items) })
            .eq('id', orderId)

          if (updErr) throw updErr

          // Додаємо запис у salary_payment_order для історії
          // Використовуємо upsert, бо наряд може оплачуватися частинами в різні періоди
          const { error: linkErr } = await supabase
            .from('salary_payment_order')
            .upsert({
              salary_payment_id: payment.id,
              technician_id: selectedTechnicianId,
              work_order_id: orderId,
              amount: ordersToUpdate[orderId].totalAmount,
            }, { onConflict: 'work_order_id' }) // Це тимчасовий фікс, поки ви не видалите UNIQUE з бази

          if (linkErr) console.warn("Link error (likely unique constraint):", linkErr)
        }
      }

      // 3. Для зовнішніх замовлень оновлюємо technician_paid_amount
      for (const ext of unpaidExternal) {
        const newPaid = (ext.technician_paid_amount || 0) + ext._salary
        const { error: updateErr } = await supabase
          .from('external_lab_order')
          .update({ technician_paid_amount: newPaid })
          .eq('id', ext.id)
        if (updateErr) {
          await supabase.from('salary_payment').delete().eq('id', payment.id)
          throw updateErr
        }
      }

      return payment
    },
    onSuccess: () => {
      // Інвалідація всіх залежних кешів
      qc.invalidateQueries({ queryKey: ['salaryPayments', selectedTechnicianId] })
      qc.invalidateQueries({ queryKey: ['paidOrders', selectedTechnicianId] })
      qc.invalidateQueries({ queryKey: ['salaryReportOrders', selectedTechnicianId] })
      qc.invalidateQueries({ queryKey: ['salaryReportExternal', selectedTechnicianId] })
      qc.invalidateQueries({ queryKey: ['technician-adjustments', selectedTechnicianId] })

      // Примусове перезавантаження даних
      refetch()
      refetchExternal()
      refetchDbAdjustments()
      setManualAdjustments([]) // Очищаємо ручні коригування після нарахування
      alert('Зарплату успішно нараховано для всіх робіт!')
    },
    onError: (err) => {
      console.error('Помилка нарахування:', err)
      alert(`Помилка нарахування: ${err.message}`)
    },
  })

  const cancelPaymentMutation = useMutation({
    mutationFn: async (paymentId) => {
      // 1. Знаходимо всі наряди, які були частиною цієї виплати
      const { data: linkedOrders, error: fetchErr } = await supabase
        .from('salary_payment_order')
        .select('work_order_id')
        .eq('salary_payment_id', paymentId)

      if (fetchErr) throw fetchErr

      // 2. Для кожного наряду "розморожуємо" айтеми, які були прив'язані до цього платежу
      for (const row of (linkedOrders || [])) {
        const { data: orderData } = await supabase
          .from('WorkOrder')
          .select('items')
          .eq('id', row.work_order_id)
          .single()

        if (orderData?.items) {
          let items = []
          try { items = typeof orderData.items === 'string' ? JSON.parse(orderData.items) : orderData.items } catch(e) {}

          let changed = false
          const updatedItems = items.map(item => {
            if (String(item.salary_payment_id) === String(paymentId)) {
              changed = true
              return { ...item, is_paid: false, salary_payment_id: null, paid_at: null }
            }
            return item
          })

          if (changed) {
            await supabase
              .from('WorkOrder')
              .update({ items: JSON.stringify(updatedItems) })
              .eq('id', row.work_order_id)
          }
        }
      }

      // 3. Видаляємо зв'язки та саму виплату
      await supabase.from('salary_payment_order').delete().eq('salary_payment_id', paymentId)

      const { error } = await supabase
        .from('salary_payment')
        .delete()
        .eq('id', paymentId)

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salaryPayments', selectedTechnicianId] })
      qc.invalidateQueries({ queryKey: ['paidOrders', selectedTechnicianId] })
      qc.invalidateQueries({ queryKey: ['salaryReportOrders'] })
      qc.invalidateQueries({ queryKey: ['salaryReportExternal'] })
      refetch()
      refetchExternal()
      alert('Виплату скасовано (зовнішні замовлення потребують ручного коригування залишку, якщо він був змінений)')
    },
    onError: (err) => {
      console.error('Помилка скасування:', err)
      alert(`Помилка скасування: ${err.message}`)
    },
  })

  const handleAccrue = () => {
    if (unpaidOrders.length === 0) {
      alert('Немає неоплачених записів для нарахування')
      return
    }
    const total = unpaidOrders.reduce((s, o) => s + o._salary, 0)
    const countWork = unpaidOrders.filter(o => o._sourceType === 'WorkOrder').length
    const countExt = unpaidOrders.filter(o => o._sourceType === 'ExternalLabOrder').length
    if (confirm(`Нарахувати ${total.toFixed(2)} ₴ за ${unpaidOrders.length} записів (наряди: ${countWork}, зовн.лаб.: ${countExt}) для ${technicianName}?`)) {
      accrueMutation.mutate()
    }
  }

  const handleCancelPayment = (payment) => {
    if (confirm(`Скасувати нарахування на ${payment.total_amount} ₴ за період ${payment.period_start} – ${payment.period_end}?`)) {
      cancelPaymentMutation.mutate(payment.id)
    }
  }

  const handleViewPayment = (payment) => {
    setSelectedPayment(payment)
    setDetailOpen(true)
  }

  const handleRowClick = (order) => {
    setDetailOrder(order)
    setDetailOpen(true)
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailOrder(null)
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/technicians')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <PageHeader title="Звіт по зарплаті техніка" subtitle="Включає наряди та замовлення зовнішніх лабораторій" />
      </div>

      <Card>
        <CardHeader><CardTitle>Параметри звіту</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label>Технік *</Label>
              <Select value={selectedTechnicianId} onValueChange={(v) => { setSelectedTechnicianId(v); setStartDateTouched(false); setShowReport(false) }}>
                <SelectTrigger><SelectValue placeholder="Оберіть техніка" /></SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Метод фільтрації</Label>
              <div className="h-10 flex items-center text-sm font-medium text-blue-600 bg-blue-50 px-3 rounded-md border border-blue-100">
                За датою внесення послуги
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Для нарядів використовується дата додавання кожної послуги окремо</p>
            </div>
            <div>
              <Label>Дата від *</Label>
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setStartDateTouched(true) }} />
            </div>
            <div>
              <Label>Дата до *</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {selectedTechnicianId && paymentHistory.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Останнє нарахування: по {format(parseISO(paymentHistory[0].period_end), 'dd.MM.yyyy', { locale: uk })} (
              {paymentHistory[0].total_amount} ₴)
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerate} disabled={techLoading || ordersLoading || externalLoading} className="gap-2">
              {(ordersLoading || externalLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              Згенерувати звіт
            </Button>
            <Button variant="outline" onClick={() => refetchAllOrders()} className="gap-2">
              <AlertCircle className="w-4 h-4" /> Показати всі наряди (без фільтра)
            </Button>
          </div>
          {ordersError && <p className="text-sm text-red-500">Помилка нарядів: {ordersError.message}</p>}
          {externalError && <p className="text-sm text-red-500">Помилка зовн.лаб.: {externalError.message}</p>}
        </CardContent>
      </Card>

      {allOrders.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Всі наряди в системі (без фільтрації)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-60 overflow-y-auto border rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="p-2">ID</th>
                    <th className="p-2">№</th>
                    <th className="p-2">Пацієнт</th>
                    <th className="p-2">technician_id</th>
                    <th className="p-2">Дата</th>
                    <th className="p-2">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {allOrders.map((o) => (
                    <tr key={o.id} className="border-b">
                      <td className="p-2 font-mono text-[10px]">{o.id}</td>
                      <td className="p-2 font-mono">{o.order_number || '—'}</td>
                      <td>{o.patient_name || '—'}</td>
                      <td className="font-mono text-[10px]">{o.technician_id || '—'}</td>
                      <td>{o.creation_date || '—'}</td>
                      <td>{o.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Всього нарядів: {allOrders.length}</p>
          </CardContent>
        </Card>
      )}

      {showReport && (
             <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 space-y-3">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                   <Plus className="w-4 h-4" /> Додати разову виплату (бонус/послугу)
                </div>
                <div className="flex gap-2">
                   <Input
                      placeholder="Опис (напр. Бонус за терміновість)"
                      value={adjDesc}
                      onChange={e => setAdjDesc(e.target.value)}
                      className="bg-white border-amber-200"
                   />
                   <Input
                      type="number"
                      placeholder="Сума"
                      value={adjAmount}
                      onChange={e => setAdjAmount(e.target.value)}
                      className="w-32 bg-white border-amber-200"
                   />
                   <Button onClick={handleAddAdjustment} className="bg-amber-600 hover:bg-amber-700">ДОДАТИ</Button>
                </div>
             </div>
      )}

      {showReport && !ordersLoading && !externalLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center flex-wrap gap-2">
              <span>
                Результати за період ({startDate} – {endDate})
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (наряди + зовн.лаб.)
                </span>
              </span>
              <span className="text-lg font-bold text-emerald-600">До виплати: {totalUnpaid.toFixed(2)} ₴</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {paidOrdersInPeriod.length > 0 && (
              <div className="flex items-center gap-2 text-xs bg-gray-50 border rounded-md p-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                У цьому періоді вже виплачено {paidOrdersInPeriod.length} замовлень на суму {totalPaidInPeriod.toFixed(2)} ₴
              </div>
            )}
            {allOrdersWithSalary.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Немає замовлень за обраний період</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Тип</TableHead>
                      <TableHead>№</TableHead>
                      <TableHead>Пацієнт / Лабораторія</TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Виплата</TableHead>
                      <TableHead className="text-right">Зарплата</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allOrdersWithSalary.map((o) => (
                      <TableRow
                        key={`${o._sourceType}-${o._sourceId}`}
                        className={`cursor-pointer hover:bg-muted/30 transition-colors ${o._paid ? 'opacity-50' : ''}`}
                        onClick={() => handleRowClick(o)}
                      >
                        <TableCell>
                          {o._type === 'Наряд' ? (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Наряд</span>
                          ) : o._type === 'Зовн.лаб.' ? (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <FlaskConical className="w-3 h-3" /> Зовн.
                            </span>
                          ) : o._sourceType === 'DbAdjustment' ? (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">З профілю</span>
                          ) : (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Тимчасове</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{o.order_number || o._sourceId}</TableCell>
                        <TableCell>
                          <div className="flex justify-between items-start">
                            <div>
                               <div>{o.patient_name || o.lab_name || '—'}</div>
                               {o._itemName && <div className="text-[10px] text-blue-500 font-medium">{o._itemName}</div>}
                            </div>
                            {o._sourceType === 'ManualAdjustment' && (
                               <button onClick={(e) => { e.stopPropagation(); removeAdjustment(o.id); }} className="text-red-400 hover:text-red-600 ml-2">
                                  <X className="w-3 h-3" />
                               </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">{o._date ? (o._date.includes('T') ? format(parseISO(o._date), 'dd.MM HH:mm') : format(parseISO(o._date), 'dd.MM.yyyy')) : '—'}</div>
                        </TableCell>
                        <TableCell>{o.status || '—'}</TableCell>
                        <TableCell>
                          {o._type === 'Зовн.лаб.' ? (
                            o._salary === 0 ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Немає оплати</span>
                            ) : o._paid ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Виплачено</span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">До виплати</span>
                            )
                          ) : (
                            o._paid ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Виплачено</span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">До виплати</span>
                            )
                          )}
                          {o._type === 'Зовн.лаб.' && o.technician_paid_amount > 0 && (
                            <span className="text-[9px] ml-1 text-muted-foreground">(випл. {o.technician_paid_amount} ₴)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{o._salary.toFixed(2)} ₴</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={6} className="text-right">ДО ВИПЛАТИ:</TableCell>
                      <TableCell className="text-right">{totalUnpaid.toFixed(2)} ₴</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
            {unpaidOrders.length > 0 && (
              <div className="flex justify-end">
                <Button onClick={handleAccrue} disabled={accrueMutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                  {accrueMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                  Нарахувати {totalUnpaid.toFixed(2)} ₴ ({unpaidOrders.length} записів)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedTechnicianId && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="w-4 h-4" /> Історія нарахувань</CardTitle></CardHeader>
          <CardContent>
            {historyLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : paymentHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">Нарахувань ще не було</p>
            ) : (
              <div className="space-y-2">
                {paymentHistory.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-md text-sm">
                    <div>
                      <div className="font-medium">{format(parseISO(p.period_start), 'dd.MM.yyyy')} – {format(parseISO(p.period_end), 'dd.MM.yyyy')}</div>
                      <div className="text-xs text-muted-foreground">{p.orders_count} записів • {p.paid_at ? format(parseISO(p.paid_at), 'dd.MM.yyyy HH:mm') : 'не виплачено'}</div>
                      {p.note && <div className="text-xs text-muted-foreground">{p.note}</div>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-emerald-600">{p.total_amount} ₴</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={() => handleViewPayment(p)}><Eye className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleCancelPayment(p)} disabled={cancelPaymentMutation.isPending}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={detailOpen} onOpenChange={closeDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailOrder?._type === 'Наряд' ? 'Деталі наряду' : 'Деталі замовлення зовн. лабораторії'}
            </DialogTitle>
            <DialogDescription>
              {detailOrder?._type === 'Наряд'
                ? `Наряд №${detailOrder?.order_number || detailOrder?._sourceId}`
                : `Замовлення №${detailOrder?._sourceId}`}
            </DialogDescription>
          </DialogHeader>

          {detailOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="font-medium">Статус:</span> {detailOrder.status || '—'}</div>
                <div><span className="font-medium">Дата:</span> {detailOrder._date ? format(parseISO(detailOrder._date), 'dd.MM.yyyy') : '—'}</div>
                {detailOrder._type === 'Наряд' ? (
                  <>
                    <div><span className="font-medium">Пацієнт:</span> {detailOrder.patient_name || '—'}</div>
                    <div><span className="font-medium">Клініка:</span> {detailOrder.clinic_name || '—'}</div>
                    <div><span className="font-medium">Лікар:</span> {detailOrder.doctor_name || '—'}</div>
                    <div><span className="font-medium">Технік:</span> {technicianName}</div>
                    <div><span className="font-medium">Загальна сума:</span> {detailOrder.total_amount?.toFixed(2) || '0.00'} ₴</div>
                    <div><span className="font-medium">Зарплата техніка:</span> {detailOrder._salary.toFixed(2)} ₴</div>
                    <div><span className="font-medium">Дедлайн:</span> {detailOrder.due_date ? format(parseISO(detailOrder.due_date), 'dd.MM.yyyy') : '—'}</div>
                    <div><span className="font-medium">Дата завершення:</span> {detailOrder.completion_date ? format(parseISO(detailOrder.completion_date), 'dd.MM.yyyy') : '—'}</div>
                    <div className="col-span-2"><span className="font-medium">Примітки:</span> {detailOrder.notes || '—'}</div>
                  </>
                ) : (
                  <>
                    <div><span className="font-medium">Лабораторія:</span> {detailOrder.lab_name || '—'}</div>
                    <div><span className="font-medium">Загальна сума:</span> {detailOrder.total_amount?.toFixed(2) || '0.00'} ₴</div>
                    <div><span className="font-medium">Зарплата техніка:</span> {detailOrder._salary.toFixed(2)} ₴</div>
                    <div><span className="font-medium">Виплачено техніку:</span> {detailOrder.technician_paid_amount?.toFixed(2) || '0.00'} ₴</div>
                    <div><span className="font-medium">Статус оплати:</span> {detailOrder.payment_status || '—'}</div>
                    <div className="col-span-2"><span className="font-medium">Примітки:</span> {detailOrder.notes || '—'}</div>
                  </>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Послуги</h4>
                {(() => {
                  const items = getItems(detailOrder)
                  if (items.length === 0) {
                    return <p className="text-sm text-muted-foreground">Немає послуг</p>
                  }
                  return (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Назва</TableHead>
                          <TableHead className="text-right">К-сть</TableHead>
                          <TableHead className="text-right">Ціна</TableHead>
                          <TableHead className="text-right">Сума</TableHead>
                          {detailOrder._type === 'Зовн.лаб.' && <TableHead className="text-right">Техніку</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{item.service_name || 'Послуга'}</TableCell>
                            <TableCell className="text-right">{item.quantity || 1}</TableCell>
                            <TableCell className="text-right">{Number(item.unit_price || 0).toFixed(2)} ₴</TableCell>
                            <TableCell className="text-right">{Number(item.total || 0).toFixed(2)} ₴</TableCell>
                            {detailOrder._type === 'Зовн.лаб.' && (
                              <TableCell className="text-right">{Number(item.technician_pay || 0).toFixed(2)} ₴</TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPayment} onOpenChange={() => { setSelectedPayment(null); setDetailOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Деталі нарахування</DialogTitle>
            <DialogDescription>Інформація про виплату за обраний період.</DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-3">
              <p><strong>Період:</strong> {selectedPayment.period_start} – {selectedPayment.period_end}</p>
              <p><strong>Сума:</strong> {selectedPayment.total_amount} ₴</p>
              <p><strong>Записів:</strong> {selectedPayment.orders_count}</p>
              <p><strong>Дата виплати:</strong> {selectedPayment.paid_at ? format(parseISO(selectedPayment.paid_at), 'dd.MM.yyyy HH:mm') : 'не виплачено'}</p>
              {selectedPayment.note && <p><strong>Примітка:</strong> {selectedPayment.note}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}