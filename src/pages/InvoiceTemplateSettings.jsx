import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Save, Upload, X, Loader2, AlertCircle, Trash2 } from 'lucide-react';

export default function InvoiceTemplateSettings() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    company_name: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    company_code: '',
    bank_name: '',
    bank_account: '',
    invoice_title: 'РАХУНОК',
    footer_text: '',
    show_bank_details: true,
    show_company_code: true,
    header_color: '#336699',
    summary_color: '#336699',
    logo_url: ''
  });

  const [uploading, setUploading] = useState(false);
  const [bucketExists, setBucketExists] = useState(false);
  const [bucketCheckLoading, setBucketCheckLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const initialized = useRef(false); // ← додано для контролю першого завантаження

  // Запит шаблонів
  const { data: templates = [], isLoading, refetch } = useQuery({
    queryKey: ['invoiceTemplates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('InvoiceTemplate')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  // Вибір шаблону за ID
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || null;

  // Оновлення форми при зміні вибраного шаблону
  useEffect(() => {
    if (selectedTemplate) {
      setFormData(selectedTemplate);
    } else {
      // Якщо шаблон не вибрано – показуємо порожню форму
      setFormData({
        company_name: '',
        company_address: '',
        company_phone: '',
        company_email: '',
        company_code: '',
        bank_name: '',
        bank_account: '',
        invoice_title: 'РАХУНОК',
        footer_text: '',
        show_bank_details: true,
        show_company_code: true,
        header_color: '#336699',
        summary_color: '#336699',
        logo_url: ''
      });
    }
  }, [selectedTemplate]);

  // Авто-вибір першого шаблону при завантаженні (лише один раз)
  useEffect(() => {
    if (!initialized.current && templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
      initialized.current = true;
    }
  }, [templates]);

  // Перевірка бакета
  useEffect(() => {
    checkBucket();
  }, []);

  const checkBucket = async () => {
    setBucketCheckLoading(true);
    try {
      const { data: buckets, error } = await supabase.storage.listBuckets();
      if (error) {
        console.error('Помилка перевірки бакетів:', error);
        setBucketExists(false);
        return;
      }
      const found = buckets.some(b => b.name === 'logos');
      setBucketExists(found);
    } catch (err) {
      console.error('Помилка:', err);
      setBucketExists(false);
    } finally {
      setBucketCheckLoading(false);
    }
  };

  // Мутація для збереження (оновлення або створення)
  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (selectedTemplateId) {
        // Оновлення існуючого
        const { data: updated, error } = await supabase
          .from('InvoiceTemplate')
          .update(data)
          .eq('id', selectedTemplateId)
          .select();
        if (error) throw error;
        return updated;
      } else {
        // Створення нового
        const { data: created, error } = await supabase
          .from('InvoiceTemplate')
          .insert([data])
          .select();
        if (error) throw error;
        return created;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceTemplates'] });
    }
  });

  // Мутація для видалення
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('InvoiceTemplate')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceTemplates'] });
      setSelectedTemplateId(null);
    }
  });

  const handleSave = () => {
    const { id, created_at, ...cleanData } = formData;
    saveMutation.mutate(cleanData);
  };

  const handleDelete = () => {
    if (!selectedTemplateId) return;
    if (confirm(`Ви впевнені, що хочете видалити шаблон "${selectedTemplate?.company_name || 'без назви'}"?`)) {
      deleteMutation.mutate(selectedTemplateId);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Завантаження логотипу
  const handleLogoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Будь ласка, оберіть зображення (PNG, JPG, SVG)');
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo_${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { data, error } = await supabase.storage
        .from('logos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        if (error.message?.includes('bucket not found')) {
          alert('Бакет "logos" не існує. Будь ласка, створіть його вручну в Supabase Storage (публічний доступ).');
          setBucketExists(false);
          return;
        }
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      const logoUrl = publicUrlData.publicUrl;

      setFormData(prev => ({ ...prev, logo_url: logoUrl }));
      setBucketExists(true);

    } catch (error) {
      console.error('Помилка завантаження логотипу:', error);
      alert('Не вдалося завантажити логотип. Спробуйте ще раз.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!formData.logo_url) return;
    setUploading(true);
    try {
      const path = formData.logo_url.split('/logos/')[1];
      if (path) {
        await supabase.storage.from('logos').remove([`logos/${path}`]);
      }
      setFormData(prev => ({ ...prev, logo_url: '' }));
    } catch (error) {
      console.error('Помилка видалення логотипу:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight">Налаштування шаблону рахунку</h1>
        <p className="text-sm text-muted-foreground mt-1">Налаштуйте зовнішній вигляд своїх рахунків</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Вибір шаблону та кнопка видалення */}
          <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-lg">
            <div className="flex-1">
              <Label className="text-xs font-medium">Вибрати шаблон</Label>
              <Select
                value={selectedTemplateId ? String(selectedTemplateId) : ''}
                onValueChange={(val) => {
                  if (val === '_new') {
                    setSelectedTemplateId(null);
                  } else {
                    setSelectedTemplateId(val ? Number(val) : null);
                  }
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Виберіть шаблон" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.company_name || `Шаблон #${t.id}`}
                    </SelectItem>
                  ))}
                  <SelectItem value="_new">— Створити новий —</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedTemplateId && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="mt-5"
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Видалити
              </Button>
            )}
          </div>

          {/* Інформація про бакет */}
          {!bucketExists && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Бакет для логотипів не знайдено</p>
                <p className="text-sm">Для завантаження логотипу створіть бакет "logos" у Supabase Storage (публічний доступ).</p>
                <div className="flex gap-2 mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs"
                    onClick={() => window.open('https://supabase.com/dashboard/project/kimlvrticnmyckzjpgpx/storage/buckets', '_blank')}
                  >
                    Перейти до Storage
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs"
                    onClick={checkBucket}
                    disabled={bucketCheckLoading}
                  >
                    {bucketCheckLoading ? 'Перевірка...' : 'Перевірити бакет'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-4 h-4" /> Інформація компанії
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Логотип */}
              <div>
                <Label className="text-sm font-medium">Логотип компанії</Label>
                <div className="mt-2 flex items-center gap-4">
                  {formData.logo_url ? (
                    <div className="relative w-24 h-24 border rounded-md overflow-hidden bg-gray-50">
                      <img
                        src={formData.logo_url}
                        alt="Логотип"
                        className="w-full h-full object-contain p-1"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                        disabled={uploading}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center bg-gray-50">
                      <span className="text-xs text-muted-foreground">Немає лого</span>
                    </div>
                  )}
                  <div>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploading}
                      className="w-48"
                    />
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG</p>
                    {uploading && (
                      <div className="flex items-center gap-2 mt-1">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs text-muted-foreground">Завантаження...</span>
                      </div>
                    )}
                    {!bucketExists && (
                      <p className="text-xs text-amber-600 mt-1">Створіть бакет "logos" для завантаження</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Назва компанії */}
              <div>
                <Label htmlFor="company_name" className="text-sm font-medium">Назва компанії *</Label>
                <Input
                  id="company_name"
                  name="company_name"
                  value={formData.company_name || ''}
                  onChange={handleChange}
                  className="mt-1"
                  placeholder='ТОВ "IMI.Lab"'
                />
              </div>

              {/* Адреса */}
              <div>
                <Label htmlFor="company_address" className="text-sm font-medium">Адреса</Label>
                <Input
                  id="company_address"
                  name="company_address"
                  value={formData.company_address || ''}
                  onChange={handleChange}
                  className="mt-1"
                  placeholder="вул. Прикладна, 123, Київ"
                />
              </div>

              {/* Телефон та Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company_phone" className="text-sm font-medium">Телефон</Label>
                  <Input
                    id="company_phone"
                    name="company_phone"
                    value={formData.company_phone || ''}
                    onChange={handleChange}
                    className="mt-1"
                    placeholder="+380 66 927 8019"
                  />
                </div>
                <div>
                  <Label htmlFor="company_email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="company_email"
                    name="company_email"
                    value={formData.company_email || ''}
                    onChange={handleChange}
                    className="mt-1"
                    placeholder="info@imi.lab"
                  />
                </div>
              </div>

              {/* Код */}
              <div>
                <Label htmlFor="company_code" className="text-sm font-medium">КВЕР / Код компанії</Label>
                <Input
                  id="company_code"
                  name="company_code"
                  value={formData.company_code || ''}
                  onChange={handleChange}
                  className="mt-1"
                  placeholder="12345678"
                />
              </div>

              {/* Банківські реквізити */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-sm font-medium">Реквізити банку</Label>
                  <Switch
                    checked={!!formData.show_bank_details}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_bank_details: checked }))}
                  />
                </div>
                {formData.show_bank_details && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="bank_name" className="text-sm font-medium">Назва банку</Label>
                      <Input
                        id="bank_name"
                        name="bank_name"
                        value={formData.bank_name || ''}
                        onChange={handleChange}
                        className="mt-1"
                        placeholder="ПриватБанк"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bank_account" className="text-sm font-medium">Номер рахунку</Label>
                      <Input
                        id="bank_account"
                        name="bank_account"
                        value={formData.bank_account || ''}
                        onChange={handleChange}
                        className="mt-1"
                        placeholder="UA123456789..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Вигляд документа</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="invoice_title" className="text-sm font-medium">Назва документа</Label>
                <Input
                  id="invoice_title"
                  name="invoice_title"
                  value={formData.invoice_title || ''}
                  onChange={handleChange}
                  className="mt-1"
                  placeholder="РАХУНОК"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="header_color" className="text-sm font-medium">Колір заголовка</Label>
                  <div className="flex gap-2 items-end mt-1">
                    <Input
                      id="header_color"
                      name="header_color"
                      type="color"
                      value={formData.header_color || '#336699'}
                      onChange={handleChange}
                      className="w-16 h-9 p-1 cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={formData.header_color || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, header_color: e.target.value }))}
                      placeholder="#336699"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="summary_color" className="text-sm font-medium">Колір суми</Label>
                  <div className="flex gap-2 items-end mt-1">
                    <Input
                      id="summary_color"
                      name="summary_color"
                      type="color"
                      value={formData.summary_color || '#336699'}
                      onChange={handleChange}
                      className="w-16 h-9 p-1 cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={formData.summary_color || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, summary_color: e.target.value }))}
                      placeholder="#336699"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="footer_text" className="text-sm font-medium">Додаткова інформація в підвалі</Label>
                <Textarea
                  id="footer_text"
                  name="footer_text"
                  value={formData.footer_text || ''}
                  onChange={handleChange}
                  className="mt-1"
                  placeholder="Додайте будь-яку додаткову інформацію, умови платежу тощо"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !formData.company_name}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Збереження...' : selectedTemplateId ? 'Оновити шаблон' : 'Створити шаблон'}
            </Button>
          </div>

          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-sm">Попередній перегляд</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {formData.logo_url && (
                <div className="flex justify-center mb-2">
                  <img src={formData.logo_url} alt="Логотип" className="h-12 object-contain" />
                </div>
              )}
              <div className="font-bold text-lg" style={{ color: formData.header_color }}>
                {formData.invoice_title || 'РАХУНОК'}
              </div>
              <div>
                <div className="font-medium">{formData.company_name || 'Назва вашої лабораторії'}</div>
                {formData.company_address && <div className="text-xs text-muted-foreground">{formData.company_address}</div>}
                {formData.company_phone && <div className="text-xs text-muted-foreground">Телефон: {formData.company_phone}</div>}
                {formData.company_email && <div className="text-xs text-muted-foreground">Email: {formData.company_email}</div>}
              </div>
              {formData.show_company_code && formData.company_code && (
                <div className="text-xs text-muted-foreground">КВЕР: {formData.company_code}</div>
              )}
              {formData.show_bank_details && formData.bank_name && (
                <div className="text-xs text-muted-foreground">
                  Банк: {formData.bank_name}
                  {formData.bank_account && ` | Рахунок: ${formData.bank_account}`}
                </div>
              )}
              {formData.footer_text && (
                <div className="text-xs text-muted-foreground whitespace-pre-wrap">{formData.footer_text}</div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}