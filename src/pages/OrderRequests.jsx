import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/api/supabaseClient';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Inbox, QrCode, Copy, Download, FilePlus2, XCircle, Trash2, Paperclip, Flame, Power } from 'lucide-react';
import { buildRequestLink, summarizeRequest, markByCode, REQUEST_STATUSES } from '@/lib/orderRequestOptions';

const BUCKET = 'order-requests';

const fmtDate = (d) => {
  if (!d) return '—';
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'dd.MM.yyyy'); } catch { return d; }
};
const fmtDateTime = (d) => {
  try { return format(parseISO(d), 'dd.MM.yyyy HH:mm'); } catch { return d; }
};

const STATUS_STYLE = {
  'Новий': 'bg-blue-100 text-blue-700',
  'Прийнято': 'bg-emerald-100 text-emerald-700',
  'Відхилено': 'bg-slate-200 text-slate-600',
};

function Row({ label, value }) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return null;
  return (
    <div className="flex gap-3 py-1.5 border-b border-border/60 last:border-0 text-sm">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex-1 whitespace-pre-wrap">{Array.isArray(value) ? value.join(', ') : value}</span>
    </div>
  );
}

// ─── Деталі заявки ───────────────────────────────────────────────────────────
function RequestDetail({ request, onClose, onCreateOrder, onReject, onDelete, busy }) {
  const d = request.details || {};
  const teeth = Object.entries(d.teeth || {}).sort(([a], [b]) => Number(a) - Number(b));

  const { data: fileUrls = [], isLoading: filesLoading } = useQuery({
    queryKey: ['order-request-files', request.id],
    enabled: (request.file_paths || []).length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(request.file_paths, 3600);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {request.patient_name}
            {request.urgent && <span className="text-xs font-bold bg-red-600 text-white rounded px-2 py-0.5">ТЕРМІНОВО</span>}
          </DialogTitle>
          <DialogDescription>
            {request.clinic_name} · {request.doctor_name} · надіслано {fmtDateTime(request.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Row label="Лікар" value={request.doctor_name} />
            <Row label="Телефон" value={request.doctor_phone} />
            <Row label="Пацієнт" value={[request.patient_name, request.patient_age && `${request.patient_age} р.`, request.patient_gender].filter(Boolean).join(', ')} />
            <Row label="Відтиски / скан" value={request.impression_date && fmtDate(request.impression_date)} />
            <Row label="Примірка" value={request.try_in_date && fmtDate(request.try_in_date)} />
            <Row label="Здача" value={request.due_date && `${fmtDate(request.due_date)}${request.due_time ? ` ${request.due_time}` : ''}`} />
          </div>

          {teeth.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {teeth.map(([t, m]) => {
                const mark = markByCode(m);
                return (
                  <span key={t} className={`text-xs rounded-md border px-2 py-1 ${mark?.color || ''}`}>
                    {t} · <b>{m}</b>
                  </span>
                );
              })}
            </div>
          )}

          <div>
            <Row label="Вид роботи" value={[...(d.work_types || []), d.work_other].filter(Boolean)} />
            <Row label="Матеріал" value={[...(d.materials || []), d.material_other].filter(Boolean)} />
            <Row label="Шкала" value={d.shade_system} />
            <Row label="Основний колір" value={d.shade_main} />
            <Row label="Ріжучий край" value={d.shade_incisal} />
            <Row label="Тіло" value={d.shade_body} />
            <Row label="Шийка" value={d.shade_cervical} />
            <Row label="Колір кукси" value={d.stump_shade} />
            <Row label="Прозорість РК" value={d.incisal_translucency} />
            <Row label="Фісури" value={d.fissure_stain} />
            <Row label="Оклюзія" value={d.occlusion} />
            <Row label="Імплант" value={[d.implant_system, d.implant_platform].filter(Boolean).join(', ')} />
            <Row label="Фіксація" value={d.implant_fixation} />
            <Row label="Абатмент" value={d.abutment_type} />
            <Row label="Додається" value={d.enclosed} />
            <Row label="Примітки" value={request.notes} />
          </div>

          {(request.file_paths || []).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><Paperclip className="w-4 h-4" /> Файли ({request.file_paths.length})</h3>
              {filesLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {fileUrls.map((f, i) => {
                    const isImg = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.path || '');
                    return (
                      <a key={f.path || i} href={f.signedUrl} target="_blank" rel="noreferrer"
                        className="aspect-square rounded-lg border overflow-hidden bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        {isImg && f.signedUrl
                          ? <img src={f.signedUrl} alt="" className="w-full h-full object-cover" />
                          : <span className="px-1 text-center break-all">{(f.path || '').split('.').pop()?.toUpperCase()}</span>}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {request.status !== 'Прийнято' && (
              <Button onClick={() => onCreateOrder(request)} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
                Створити наряд
              </Button>
            )}
            {request.status === 'Новий' && (
              <Button variant="outline" onClick={() => onReject(request)} className="gap-2">
                <XCircle className="w-4 h-4" /> Відхилити
              </Button>
            )}
            <Button variant="ghost" className="gap-2 text-destructive" onClick={() => onDelete(request)}>
              <Trash2 className="w-4 h-4" /> Видалити
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Посилання / QR ──────────────────────────────────────────────────────────
function LinkCard({ link, onToggle }) {
  const wrap = useRef(null);
  const url = buildRequestLink(link.token);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { window.prompt('Скопіюйте посилання:', url); }
  };

  const download = () => {
    const canvas = wrap.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `QR-naryad-${link.clinic_name.replace(/[^\p{L}\p{N}]+/gu, '_')}.png`;
    a.click();
  };

  return (
    <div className={`rounded-xl border bg-card p-4 flex gap-4 ${link.active ? '' : 'opacity-60'}`}>
      <div ref={wrap} className="shrink-0 bg-white p-1.5 rounded-lg border">
        <QRCodeCanvas value={url} size={512} level="M" style={{ width: 104, height: 104 }} />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{link.clinic_name}</p>
            <p className="text-xs text-muted-foreground">{link.active ? 'Активне' : 'Вимкнене — форма не приймає наряди'}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground break-all">{url}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={copy}><Copy className="w-3.5 h-3.5" />{copied ? 'Скопійовано' : 'Копіювати'}</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={download}><Download className="w-3.5 h-3.5" />QR (PNG)</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onToggle(link)}>
            <Power className="w-3.5 h-3.5" />{link.active ? 'Вимкнути' : 'Увімкнути'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Сторінка ────────────────────────────────────────────────────────────────
export default function OrderRequests() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('Новий');
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newClinicId, setNewClinicId] = useState('');
  const [newClinicName, setNewClinicName] = useState('');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['order-requests'],
    queryFn: async () => {
      const { data, error } = await supabase.from('order_request').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: links = [], isLoading: linksLoading, error: linksError } = useQuery({
    queryKey: ['order-request-links'],
    queryFn: async () => {
      const { data, error } = await supabase.from('order_request_link').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: clinics = [] } = useQuery({
    queryKey: ['clinics-min'],
    queryFn: async () => {
      const { data } = await supabase.from('clinic').select('id, name').order('name', { ascending: true });
      return data || [];
    },
  });

  const filtered = useMemo(
    () => (statusFilter === '_all' ? requests : requests.filter(r => r.status === statusFilter)),
    [requests, statusFilter]
  );
  const newCount = requests.filter(r => r.status === 'Новий').length;

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('order_request').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order-requests'] }); setSelected(null); },
    onError: (e) => alert(`Помилка: ${e.message}`),
  });

  const deleteRequest = useMutation({
    mutationFn: async (r) => {
      if ((r.file_paths || []).length) await supabase.storage.from(BUCKET).remove(r.file_paths);
      const { error } = await supabase.from('order_request').delete().eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order-requests'] }); setSelected(null); },
    onError: (e) => alert(`Помилка: ${e.message}`),
  });

  const createLink = useMutation({
    mutationFn: async () => {
      const clinic = clinics.find(c => String(c.id) === newClinicId);
      const name = (clinic?.name || newClinicName).trim();
      if (!name) throw new Error('Оберіть клініку або впишіть назву');
      const { error } = await supabase.from('order_request_link').insert([{ clinic_id: clinic ? String(clinic.id) : null, clinic_name: name }]);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['order-request-links'] }); setNewClinicId(''); setNewClinicName(''); },
    onError: (e) => alert(e.message),
  });

  const toggleLink = useMutation({
    mutationFn: async (link) => {
      const { error } = await supabase.from('order_request_link').update({ active: !link.active }).eq('id', link.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order-request-links'] }),
    onError: (e) => alert(`Помилка: ${e.message}`),
  });

  // Відкриває стандартну форму наряду з даними із заявки
  const handleCreateOrder = async (r) => {
    setCreating(true);
    try {
      const d = r.details || {};
      let doctorId = 'none';
      try {
        const { data: docs } = await supabase.from('doctor').select('id, full_name');
        const match = (docs || []).find(doc => (doc.full_name || '').trim().toLowerCase() === (r.doctor_name || '').trim().toLowerCase());
        if (match) doctorId = String(match.id);
      } catch { /* не критично */ }

      let fileUrls = [];
      if ((r.file_paths || []).length) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrls(r.file_paths, 60 * 60 * 24 * 365 * 5);
        fileUrls = (data || []).map(f => f.signedUrl).filter(Boolean);
      }

      const summary = summarizeRequest(r);
      const prefill = {
        _request_id: r.id,
        clinic_id: r.clinic_id || 'none',
        doctor_id: doctorId,
        patient_name: r.patient_name || '',
        patient_age: r.patient_age ?? '',
        patient_gender: r.patient_gender || '',
        due_date: r.due_date || '',
        tooth_color: d.shade_main || '',
        selected_teeth: Object.keys(d.teeth || {}).map(t => parseInt(t, 10)).filter(t => !isNaN(t)),
        notes: (doctorId === 'none' ? `Лікар: ${r.doctor_name}\n` : '') + (r.urgent ? 'ТЕРМІНОВО\n' : '') + summary,
        file_urls: fileUrls,
        status: 'Новий',
      };
      setSelected(null);
      navigate('/orders', { state: { prefillOrder: prefill } });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Заявки від лікарів" subtitle="Наряди, надіслані через QR-код" />

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests" className="gap-1.5">
            <Inbox className="w-4 h-4" /> Заявки{newCount ? ` (${newCount})` : ''}
          </TabsTrigger>
          <TabsTrigger value="links" className="gap-1.5"><QrCode className="w-4 h-4" /> QR-коди клінік</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-3 mt-4">
          <div className="flex flex-wrap gap-2">
            {[...REQUEST_STATUSES, '_all'].map(s => (
              <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)}>
                {s === '_all' ? 'Усі' : s}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Заявок немає</div>
          ) : (
            <div className="grid gap-2">
              {filtered.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="text-left rounded-xl border bg-card p-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{r.patient_name}</span>
                      {r.urgent && <Flame className="w-4 h-4 text-red-600 shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.clinic_name} · {r.doctor_name} · {fmtDateTime(r.created_at)}
                      {r.due_date ? ` · здача ${fmtDate(r.due_date)}` : ''}
                    </p>
                  </div>
                  {(r.file_paths || []).length > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Paperclip className="w-3.5 h-3.5" />{r.file_paths.length}</span>
                  )}
                  <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="links" className="space-y-4 mt-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold">Новий QR-код для клініки</p>
            <p className="text-xs text-muted-foreground">
              У кожної клініки свій QR із секретним кодом. Наряди без правильного коду не приймаються.
              Якщо код потрапив не туди, вимкніть його і створіть новий.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={newClinicId} onValueChange={(v) => { setNewClinicId(v); setNewClinicName(''); }}>
                <SelectTrigger className="sm:w-64"><SelectValue placeholder="Оберіть клініку" /></SelectTrigger>
                <SelectContent>
                  {clinics.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder="або впишіть назву"
                value={newClinicName}
                onChange={(e) => { setNewClinicName(e.target.value); setNewClinicId(''); }}
                className="sm:flex-1"
              />
              <Button onClick={() => createLink.mutate()} disabled={createLink.isPending} className="gap-2">
                {createLink.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                Створити
              </Button>
            </div>
          </div>

          {linksError ? (
            <p className="text-sm text-destructive">
              Не вдалося завантажити QR-коди. Переконайтеся, що SQL-скрипт supabase/migrations/20261109_doctor_order_requests.sql виконано в Supabase.
            </p>
          ) : linksLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {links.map(l => <LinkCard key={l.id} link={l} onToggle={(link) => toggleLink.mutate(link)} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {selected && (
        <RequestDetail
          request={selected}
          busy={creating}
          onClose={() => setSelected(null)}
          onCreateOrder={handleCreateOrder}
          onReject={(r) => updateStatus.mutate({ id: r.id, status: 'Відхилено' })}
          onDelete={(r) => { if (window.confirm('Видалити заявку разом з файлами?')) deleteRequest.mutate(r); }}
        />
      )}
    </div>
  );
}
