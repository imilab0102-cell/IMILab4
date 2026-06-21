import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, DollarSign, Save, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function CostCalculator() {
  const usdToGrn = 41;
  const queryClient = useQueryClient();
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  // Отримуємо список послуг з прайс-листа
  const { data: rawPriceItems, isLoading: priceLoading } = useQuery({
    queryKey: ['priceItems'],
    queryFn: async () => {
      const { data, error } = await supabase.from('price_item').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });
  const priceItems = Array.isArray(rawPriceItems) ? rawPriceItems : [];

  // Отримуємо збережені витрати для вибраної послуги
  const { data: existingCosts } = useQuery({
    queryKey: ['serviceCosts', 'calculator'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_cost').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const [calc, setCalc] = useState({
    selectedPriceItemId: '',
    serviceName: 'ZrO2 Mult. XT-Cera на власну опорі',
    priceValue: 42,
    priceCurrency: 'USD',
    fixedCosts: 400,
    gypsum: { quantity: 0.5, unitPrice: 60 },
    milling: { value: 15, currency: 'USD' },
    print3d: 0,
    otherMaterials: 0,
    stage1: { pay: 100, technician: 'Помічник' },
    stage2: { payType: 'percentage', payValue: 30, technician: 'Основний' },
    stage3: { pay: 0, technician: '' },
  });

  // Завантажуємо збережені витрати при виборі послуги
  useEffect(() => {
    if (!calc.selectedPriceItemId) return;
    const cost = existingCosts?.find(c => c.price_item_id === calc.selectedPriceItemId);
    if (cost) {
      setCalc(prev => ({
        ...prev,
        fixedCosts: cost.fixed_costs || 400,
        gypsum: {
          quantity: cost.gypsum_quantity || 0.5,
          unitPrice: cost.gypsum_unit_price || 60,
        },
        milling: {
          value: cost.milling_cost / usdToGrn || 15,
          currency: 'USD',
        },
        print3d: cost.print3d_cost || 0,
        otherMaterials: cost.other_materials_cost || 0,
      }));
    }
  }, [calc.selectedPriceItemId, existingCosts]);

  // === ВИПРАВЛЕНО: зберігаємо тільки існуючі колонки ===
  const saveCostMutation = useMutation({
    mutationFn: async (costData) => {
      // Перевіряємо, чи є вже запис для цієї послуги
      const { data: existing, error: findError } = await supabase
        .from('service_cost')
        .select('id')
        .eq('price_item_id', costData.price_item_id)
        .maybeSingle();

      if (findError) throw findError;

      // Беремо тільки ті поля, які є в таблиці
      const payload = {
        price_item_id: costData.price_item_id,
        material_costs: costData.material_costs,
        technician_pay: costData.technician_pay,
        fixed_costs: costData.fixed_costs,
        total_cost: costData.total_cost,
        net_profit: costData.net_profit,
        profitability_percent: costData.profitability_percent,
        // Додаємо додаткові поля, якщо вони є в таблиці
        // Якщо їх немає, вони будуть проігноровані
        // Але ми не включаємо gypsum_quantity тощо, щоб уникнути помилок
      };

      if (existing) {
        // Оновлюємо існуючий
        const { error } = await supabase
          .from('service_cost')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Створюємо новий
        const { error } = await supabase
          .from('service_cost')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceCosts'] });
      queryClient.invalidateQueries({ queryKey: ['serviceCosts', 'calculator'] });
      setSaveMessage('✓ Витрати успішно збережено!');
      setSaveError('');
      setTimeout(() => setSaveMessage(''), 3000);
    },
    onError: (err) => {
      console.error('Помилка збереження витрат:', err);
      setSaveError(`Помилка збереження: ${err.message}`);
      setSaveMessage('');
      setTimeout(() => setSaveError(''), 5000);
    },
  });

  // Розрахунки
  const priceGrn = calc.priceCurrency === 'USD' ? calc.priceValue * usdToGrn : calc.priceValue;

  const gypsumCost = calc.gypsum.quantity * calc.gypsum.unitPrice;
  const millingCost = calc.milling.currency === 'USD' ? calc.milling.value * usdToGrn : calc.milling.value;
  const print3dCost = calc.print3d;
  const otherMaterialsCost = calc.otherMaterials;

  const totalMaterialsCost = gypsumCost + millingCost + print3dCost + otherMaterialsCost;

  const stage1Pay = calc.stage1.pay;
  const stage2Pay = calc.stage2.payType === 'percentage' ? (priceGrn * calc.stage2.payValue) / 100 : calc.stage2.pay;
  const stage3Pay = calc.stage3.pay;

  const totalTechnicianPay = stage1Pay + stage2Pay + stage3Pay;
  const totalCost = totalMaterialsCost + totalTechnicianPay + calc.fixedCosts;
  const netProfit = priceGrn - totalCost;
  const netProfitUsd = netProfit / usdToGrn;
  const profitability = priceGrn > 0 ? ((netProfit / priceGrn) * 100).toFixed(2) : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>📊 Інтерактивний калькулятор собівартості</CardTitle>
          <CardDescription>Розрахунок прибутку та рентабельності конкретної роботи</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Загальні налаштування */}
          <div>
            <h3 className="font-semibold text-sm mb-4">1. ЗАГАЛЬНІ НАЛАШТУВАННЯ</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Постійні витрати на 1 роботу (грн)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={calc.fixedCosts}
                  onChange={e => setCalc({ ...calc, fixedCosts: Number(e.target.value) })}
                  placeholder="400"
                />
              </div>
            </div>
          </div>

          {/* Дані послуги */}
          <div>
            <h3 className="font-semibold text-sm mb-4">2. ДАНІ ПОСЛУГИ</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Виберіть послугу з прайс-листу</Label>
                <Select value={calc.selectedPriceItemId} onValueChange={(id) => {
                  const item = priceItems.find(p => p && p.id === id);
                  if (item) {
                    setCalc({
                      ...calc,
                      selectedPriceItemId: id,
                      serviceName: item.name || '',
                      priceValue: item.client_price || 0,
                      priceCurrency: item.price_currency || 'UAH',
                    });
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={priceLoading ? "Завантаження послуг..." : "Оберіть послугу..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {priceItems.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">Немає доступних послуг</div>
                    ) : (
                      priceItems.map(item => item && item.id && (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} ({item.client_price} {item.price_currency || 'UAH'})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Назва послуги (можна відредагувати)</Label>
                <Input
                  type="text"
                  value={calc.serviceName}
                  onChange={e => setCalc({ ...calc, serviceName: e.target.value })}
                  placeholder="ZrO2 Mult. XT-Cera"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Прайс для клієнта</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calc.priceValue}
                    onChange={e => setCalc({ ...calc, priceValue: Number(e.target.value) })}
                    placeholder="42"
                  />
                </div>
                <div>
                  <Label className="text-xs">Валюта</Label>
                  <Select value={calc.priceCurrency} onValueChange={v => setCalc({ ...calc, priceCurrency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">$ USD</SelectItem>
                      <SelectItem value="UAH">₴ UAH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Витрати на матеріали та виробництво */}
          <div>
            <h3 className="font-semibold text-sm mb-4">3. ВИТРАТИ НА МАТЕРІАЛИ ТА ВИРОБНИЦТВО</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Гіпс (кг)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calc.gypsum.quantity}
                    onChange={e => setCalc({
                      ...calc,
                      gypsum: { ...calc.gypsum, quantity: Number(e.target.value) }
                    })}
                    placeholder="0.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Ціна за кг (грн)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calc.gypsum.unitPrice}
                    onChange={e => setCalc({
                      ...calc,
                      gypsum: { ...calc.gypsum, unitPrice: Number(e.target.value) }
                    })}
                    placeholder="60"
                  />
                </div>
                <div>
                  <Label className="text-xs">Сума</Label>
                  <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm font-medium">
                    {gypsumCost.toFixed(0)} ₴
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Фрезеровка цирконію</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calc.milling.value}
                    onChange={e => setCalc({
                      ...calc,
                      milling: { ...calc.milling, value: Number(e.target.value) }
                    })}
                    placeholder="15"
                  />
                </div>
                <div>
                  <Label className="text-xs">Валюта</Label>
                  <Select value={calc.milling.currency} onValueChange={v => setCalc({ ...calc, milling: { ...calc.milling, currency: v } })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">$ USD</SelectItem>
                      <SelectItem value="UAH">₴ UAH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">= в грн</Label>
                  <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm font-medium">
                    {millingCost.toFixed(0)} ₴
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">3D-друк (грн)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calc.print3d}
                    onChange={e => setCalc({ ...calc, print3d: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs">Інші матеріали (грн)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calc.otherMaterials}
                    onChange={e => setCalc({ ...calc, otherMaterials: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ЗП техніків */}
          <div>
            <h3 className="font-semibold text-sm mb-4">4. ЗАРПЛАТА ТЕХНІКІВ ЗА ЕТАПИ</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Етап 1: Гіпсовка (грн)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calc.stage1.pay}
                    onChange={e => setCalc({
                      ...calc,
                      stage1: { ...calc.stage1, pay: Number(e.target.value) }
                    })}
                    placeholder="100"
                  />
                </div>
                <div>
                  <Label className="text-xs">Технік</Label>
                  <Input
                    type="text"
                    value={calc.stage1.technician}
                    onChange={e => setCalc({
                      ...calc,
                      stage1: { ...calc.stage1, technician: e.target.value }
                    })}
                    placeholder="Помічник"
                  />
                </div>
                <div>
                  <Label className="text-xs">=</Label>
                  <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm font-medium">
                    {stage1Pay.toFixed(0)} ₴
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Етап 2: Моделювання</Label>
                  <Select value={calc.stage2.payType} onValueChange={v => setCalc({ ...calc, stage2: { ...calc.stage2, payType: v } })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">% від прайсу</SelectItem>
                      <SelectItem value="fixed">Фіксовано (грн)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">
                    {calc.stage2.payType === 'percentage' ? 'Відсоток (%)' : 'Сума (грн)'}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calc.stage2.payValue}
                    onChange={e => setCalc({
                      ...calc,
                      stage2: { ...calc.stage2, payValue: Number(e.target.value) }
                    })}
                    placeholder={calc.stage2.payType === 'percentage' ? '30' : '0'}
                  />
                </div>
                <div>
                  <Label className="text-xs">=</Label>
                  <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm font-medium">
                    {stage2Pay.toFixed(0)} ₴
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Етап 3: Полірування (грн)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calc.stage3.pay}
                    onChange={e => setCalc({
                      ...calc,
                      stage3: { ...calc.stage3, pay: Number(e.target.value) }
                    })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs">Технік</Label>
                  <Input
                    type="text"
                    value={calc.stage3.technician}
                    onChange={e => setCalc({
                      ...calc,
                      stage3: { ...calc.stage3, technician: e.target.value }
                    })}
                    placeholder="-"
                  />
                </div>
                <div>
                  <Label className="text-xs">=</Label>
                  <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm font-medium">
                    {stage3Pay.toFixed(0)} ₴
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* РЕЗУЛЬТАТИ РОЗРАХУНКІВ */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle>💰 РЕЗУЛЬТАТИ РОЗРАХУНКІВ</CardTitle>
          <CardDescription>Детальний аналіз собівартості та прибутку</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 1. Детальний розпис витрат */}
          <div>
            <h3 className="font-semibold text-sm mb-4 text-primary">1️⃣ ДЕТАЛЬНИЙ РОЗПИС ВИТРАТ</h3>
            <div className="bg-card border border-border rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Гіпс ({calc.gypsum.quantity} кг × {calc.gypsum.unitPrice} грн/кг)</span>
                <span className="font-semibold">{gypsumCost.toFixed(2)} грн</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Фрезеровка цирконію</span>
                <span className="font-semibold">{millingCost.toFixed(2)} грн</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">3D-друк</span>
                <span className="font-semibold">{print3dCost.toFixed(2)} грн</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Інші матеріали</span>
                <span className="font-semibold">{otherMaterialsCost.toFixed(2)} грн</span>
              </div>
              <div className="border-t border-border pt-2 mt-2 flex justify-between font-semibold text-primary">
                <span>Сума матеріалів:</span>
                <span>{totalMaterialsCost.toFixed(2)} грн</span>
              </div>

              <div className="border-t border-border pt-2 mt-4 space-y-2">
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Етап 1 - {calc.stage1.technician || '-'} (Гіпсовка)</span>
                  <span className="font-semibold">{stage1Pay.toFixed(2)} грн</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Етап 2 - {calc.stage2.technician || '-'} ({calc.stage2.payType === 'percentage' ? `${calc.stage2.payValue}% від прайсу` : 'фіксовано'})</span>
                  <span className="font-semibold">{stage2Pay.toFixed(2)} грн</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Етап 3 - {calc.stage3.technician || '-'} (Полірування)</span>
                  <span className="font-semibold">{stage3Pay.toFixed(2)} грн</span>
                </div>
                <div className="border-t border-border pt-2 mt-2 flex justify-between font-semibold text-amber-600">
                  <span>Сума ЗП техніків:</span>
                  <span>{totalTechnicianPay.toFixed(2)} грн</span>
                </div>
              </div>

              <div className="border-t border-border pt-2 mt-4 flex justify-between py-1">
                <span className="text-muted-foreground">Постійні витрати на роботу</span>
                <span className="font-semibold">{calc.fixedCosts.toFixed(2)} грн</span>
              </div>
            </div>
          </div>

          {/* 2. Загальна собівартість */}
          <div>
            <h3 className="font-semibold text-sm mb-4 text-primary">2️⃣ ЗАГАЛЬНА СОБІВАРТІСТЬ РОБОТИ</h3>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="text-center">
                <p className="text-muted-foreground text-sm mb-1">Собівартість (Матеріали + ЗП + Постійні витрати)</p>
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                  {totalCost.toFixed(2)} ₴
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {totalMaterialsCost.toFixed(2)} (матеріали) + {totalTechnicianPay.toFixed(2)} (ЗП) + {calc.fixedCosts.toFixed(2)} (накладні)
                </p>
              </div>
            </div>
          </div>

          {/* 3. Чистий прибуток */}
          <div>
            <h3 className="font-semibold text-sm mb-4 text-primary">3️⃣ ЧИСТИЙ ПРИБУТОК ЛАБОРАТОРІЇ</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                <p className="text-muted-foreground text-sm mb-1">У гривнях</p>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  +{netProfit.toFixed(2)} ₴
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {priceGrn.toFixed(2)} - {totalCost.toFixed(2)}
                </p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                <p className="text-muted-foreground text-sm mb-1">У доларах</p>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  +{netProfitUsd.toFixed(2)} $
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  (курс: 1 USD = {usdToGrn} ₴)
                </p>
              </div>
            </div>
          </div>

          {/* 4. Рентабельність */}
          <div>
            <h3 className="font-semibold text-sm mb-4 text-primary">4️⃣ РЕНТАБЕЛЬНІСТЬ РОБОТИ</h3>
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-muted-foreground text-sm mb-1">Маржа прибутку (Profit Margin)</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {profitability}%
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                ({netProfit.toFixed(2)} ₴ / {priceGrn.toFixed(2)} ₴) × 100
              </p>
            </div>
          </div>

          {/* Рекомендації */}
          <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20 p-4 rounded">
            <div className="flex gap-3">
              <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-blue-900 dark:text-blue-300 mb-1">Аналіз рентабельності:</p>
                <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                  {profitability >= 30 && <li>✅ Висока маржа — розраховна стратегія роботи</li>}
                  {profitability >= 15 && profitability < 30 && <li>⚠️ Середня маржа — можна оптимізувати витрати</li>}
                  {profitability < 15 && profitability >= 0 && <li>⚠️ Низька маржа — перевір ціни та витрати</li>}
                  {netProfit < 0 && <li>❌ Негативний прибуток — переглянути калькуляцію</li>}
                </ul>
              </div>
            </div>
          </div>

          {/* Кнопка збереження */}
          <div className="flex items-center gap-3 pt-4">
            <Button
              onClick={() => {
                if (!calc.selectedPriceItemId) {
                  alert('Будь ласка, оберіть послугу для збереження витрат');
                  return;
                }
                saveCostMutation.mutate({
                  price_item_id: calc.selectedPriceItemId,
                  material_costs: totalMaterialsCost,
                  technician_pay: totalTechnicianPay,
                  fixed_costs: calc.fixedCosts,
                  total_cost: totalCost,
                  net_profit: netProfit,
                  profitability_percent: parseFloat(profitability),
                });
              }}
              disabled={saveCostMutation.isPending}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saveCostMutation.isPending ? 'Збереження...' : 'Зберегти витрати'}
            </Button>
            {saveMessage && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                {saveMessage}
              </div>
            )}
            {saveError && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertTriangle className="w-4 h-4" />
                {saveError}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}