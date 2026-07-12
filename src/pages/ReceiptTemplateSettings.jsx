import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Trash2, Loader2, X, AlertCircle } from 'lucide-react';

export default function ReceiptTemplateSettings() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    company_name: '',
    subtitle: '',
    doc_type: '',
    warranty_text: '',
    thanks_text: '',
    contacts: '',
    logo_url: '',
    show_technician: false,
    show_teeth_data: true,
    show_payment_status: false,
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const initialized = useRef(false);

  // Завантаження всіх шаблонів
  const { data: templates = [], isLoading, refetch } = useQuery({
    queryKey: ['receiptTemplates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_template')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || null;

  // Автовибір першого шаблону при завантаженні
  useEffect(() => {
    if (!initialized.current && templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
      initialized.current = true;
    }
  }, [templates]);

  // Оновлення форми при зміні вибраного шаблону
  useEffect(() => {
    if (selectedTemplate) {
      setFormData({
        company_name: selectedTemplate.company_name || '',
        subtitle: selectedTemplate.subtitle || '',
        doc_type: selectedTemplate.doc_type || '',
        warranty_text: selectedTemplate.warranty_text || '',
        thanks_text: selectedTemplate.thanks_text || '',
        contacts: selectedTemplate.contacts || '',
        logo_url: selectedTemplate.logo_url || '',
        show_technician: selectedTemplate.show_technician || false,
        show_teeth_data: selectedTemplate.show_teeth_data !== undefined ? selectedTemplate.show_teeth_data : true,
        show_payment_status: selectedTemplate.show_payment_status || false,
      });
    } else {
      setFormData({
        company_name: '',
        subtitle: '',
        doc_type: '',
        warranty_text: '',
        thanks_text: '',
        contacts: '',
        logo_url: '',
        show_technician: false,
        show_teeth_data: true,
        show_payment_status: false,
      });
    }
  }, [selectedTemplate]);

  // Мутація для збереження
  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (selectedTemplateId) {
        const { error } = await supabase
          .from('receipt_template')
          .update(data)
          .eq('id', selectedTemplateId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('receipt_template')
          .insert([data]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      // Синхронізація з OrderDetail: оновлюємо обидва ключі
      queryClient.invalidateQueries({ queryKey: ['receiptTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['receiptTemplate'] }); // ← ключ, який використовує OrderDetail
      alert('Шаблон чеку успішно збережено!');
    },
    onError: (error) => {
      console.error('Помилка збереження:', error);
      alert(`Помилка: ${error.message}`);
    },
  });

  // Мутація для видалення
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('receipt_template')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receiptTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['receiptTemplate'] });
      setSelectedTemplateId(null);
      alert('Шаблон видалено!');
    },
    onError: (error) => {
      console.error('Помилка видалення:', error);
      alert(`Помилка видалення: ${error.message}`);
    },
  });

  const handleSave = () => {
    const { id, created_at, updated_at, ...cleanData } = formData;
    saveMutation.mutate(cleanData);
  };

  const handleDelete = () => {
    if (!selectedTemplateId) return;
    if (confirm(`Ви впевнені, що хочете видалити шаблон чеку?`)) {
      deleteMutation.mutate(selectedTemplateId);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSwitchChange = (name, checked) => {
    setFormData(prev => ({ ...prev, [name]: checked }));
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
      const fileName = `receipt_logo_${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { data, error } = await supabase.storage
        .from('logos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        if (error.message?.includes('bucket not found')) {
          alert('Бакет "logos" не існує. Створіть його вручну в Supabase Storage (публічний доступ).');
          return;
        }
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      const logoUrl = publicUrlData.publicUrl;
      setFormData(prev => ({ ...prev, logo_url: logoUrl }));
    } catch (error) {
      console.error('Помилка завантаження логотипу:', error);
      alert('Не вдалося завантажити логотип. Спробуйте ще раз або вставте URL вручну.');
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold font-heading tracking-tight">Налаштування шаблону чеку</h1>
        <p className="text-sm text-muted-foreground mt-1">Керуйте шаблонами чеків для лікаря</p>
      </div>

      {/* Вибір шаблону та видалення */}
      <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-lg">
        <div className="flex-1">
          <Label className="text-xs font-medium">Вибрати шаблон</Label>
          <Select
            value={selectedTemplateId || ''}
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

      <Card>
        <CardHeader>
          <CardTitle>Основні налаштування</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Логотип */}
          <div>
            <Label className="text-sm font-medium">Логотип компанії</Label>
            <div className="mt-2 flex flex-wrap items-center gap-4">
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
              </div>
            </div>
            <div className="mt-2">
              <Label className="text-xs text-muted-foreground">Або вставте URL логотипу вручну:</Label>
              <Input
                type="text"
                name="logo_url"
                value={formData.logo_url}
                onChange={handleChange}
                placeholder="https://.../logo.png"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="company_name">Назва компанії</Label>
            <Input
              id="company_name"
              name="company_name"
              value={formData.company_name}
              onChange={handleChange}
              placeholder="▲ 1M LAB ▲"
            />
          </div>

          <div>
            <Label htmlFor="subtitle">Підзаголовок</Label>
            <Input
              id="subtitle"
              name="subtitle"
              value={formData.subtitle}
              onChange={handleChange}
              placeholder="Digital Laboratory"
            />
          </div>

          <div>
            <Label htmlFor="doc_type">Назва документа</Label>
            <Input
              id="doc_type"
              name="doc_type"
              value={formData.doc_type}
              onChange={handleChange}
              placeholder="НАРЯД-ЧЕК ЛІКАРЯ"
            />
          </div>

          <div>
            <Label htmlFor="warranty_text">Текст гарантії</Label>
            <Input
              id="warranty_text"
              name="warranty_text"
              value={formData.warranty_text}
              onChange={handleChange}
              placeholder="ГАРАНТІЯ НА КАРКАС: 5 РОКІВ"
            />
          </div>

          <div>
            <Label htmlFor="thanks_text">Текст подяки</Label>
            <Input
              id="thanks_text"
              name="thanks_text"
              value={formData.thanks_text}
              onChange={handleChange}
              placeholder="Дякуємо за довіру до нашої цифрової екосистеми!"
            />
          </div>

          <div>
            <Label htmlFor="contacts">Контакти</Label>
            <Input
              id="contacts"
              name="contacts"
              value={formData.contacts}
              onChange={handleChange}
              placeholder="t.me/one_m_lab_bot"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Налаштування відображення</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="show_technician">Показувати техніка</Label>
            <Switch
              id="show_technician"
              checked={formData.show_technician}
              onCheckedChange={(checked) => handleSwitchChange('show_technician', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="show_teeth_data">Показувати технічні дані (зуби, колір)</Label>
            <Switch
              id="show_teeth_data"
              checked={formData.show_teeth_data}
              onCheckedChange={(checked) => handleSwitchChange('show_teeth_data', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="show_payment_status">Показувати статус оплати</Label>
            <Switch
              id="show_payment_status"
              checked={formData.show_payment_status}
              onCheckedChange={(checked) => handleSwitchChange('show_payment_status', checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={saveMutation.isPending}
        className="gap-2 bg-primary hover:bg-primary/90"
      >
        <Save className="w-4 h-4" />
        {saveMutation.isPending ? 'Збереження...' : 'Зберегти налаштування'}
      </Button>
    </div>
  );
}