import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, CheckCircle2, Phone } from 'lucide-react';
import {
  UPPER_TEETH, LOWER_TEETH, TOOTH_MARKS, markByCode, WORK_TYPES, MATERIALS,
  SHADE_SYSTEMS, TRANSLUCENCY, FISSURES, OCCLUSION, IMPLANT_FIXATION, ABUTMENT_TYPES, ENCLOSED,
} from '@/lib/orderRequestOptions';

const emptyForm = {
  doctor_name: '', doctor_phone: '',
  patient_name: '', patient_age: '', patient_gender: '',
  impression_date: '', try_in_date: '', due_date: '', due_time: '',
  urgent: false,
  teeth: {},
  work_types: [], work_other: '',
  materials: [], material_other: '',
  shade_system: '', shade_main: '', shade_incisal: '', shade_body: '', shade_cervical: '', stump_shade: '',
  incisal_translucency: '', fissure_stain: '', occlusion: '',
  implant_system: '', implant_platform: '', implant_fixation: '', abutment_type: '',
  enclosed: [],
  notes: '',
};

const ERRORS = {
  invalid_link: 'Посилання недійсне. Зверніться до лабораторії.',
  rate_limited: 'Забагато нарядів за короткий час. Спробуйте трохи пізніше.',
  missing_fields: "Заповніть ПІБ лікаря та пацієнта.",
  too_large: 'Наряд занадто великий. Скоротіть примітки.',
};

const storageKey = (token) => `naryad_doctor_${token}`;

function Section({ title, children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Chips({ options, value, onChange, multiple = false }) {
  const isOn = (o) => (multiple ? value.includes(o) : value === o);
  const toggle = (o) => {
    if (multiple) onChange(isOn(o) ? value.filter(v => v !== o) : [...value, o]);
    else onChange(isOn(o) ? '' : o);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          type="button"
          key={o}
          onClick={() => toggle(o)}
          className={`px-3 py-2 rounded-xl border text-sm transition-colors ${
            isOn(o) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function TeethPicker({ value, onChange }) {
  const [mark, setMark] = useState('К');

  const tap = (n) => {
    const key = String(n);
    const next = { ...value };
    if (next[key] === mark) delete next[key];
    else next[key] = mark;
    onChange(next);
  };

  const renderRow = (teeth) => (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
      {teeth.map((n, i) => {
        const m = markByCode(value[String(n)]);
        return (
          <button
            type="button"
            key={n}
            onClick={() => tap(n)}
            className={`flex flex-col items-center justify-center rounded-md border h-11 text-[10px] leading-none ${
              m ? m.color : 'bg-white border-slate-300 text-slate-500'
            } ${i === 7 ? 'mr-1' : ''}`}
          >
            <span className="font-semibold">{n}</span>
            <span className="text-xs font-bold mt-0.5 h-3">{m ? m.code : ''}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TOOTH_MARKS.map(m => (
          <button
            type="button"
            key={m.code}
            onClick={() => setMark(m.code)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs ${mark === m.code ? m.color : 'bg-white border-slate-300 text-slate-700'}`}
          >
            <b>{m.code}</b> {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">Оберіть позначку, потім натисніть на зуби. Повторне натискання знімає позначку.</p>
      <div className="space-y-1 overflow-x-auto">
        {renderRow(UPPER_TEETH)}
        <div className="border-t border-dashed border-slate-300" />
        {renderRow(LOWER_TEETH)}
      </div>
    </div>
  );
}

export default function PublicOrderRequest() {
  const { token } = useParams();
  const [clinicName, setClinicName] = useState(null);
  const [loadState, setLoadState] = useState('loading'); // loading | ok | invalid
  const [form, setForm] = useState(emptyForm);
  const [hp, setHp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sentId, setSentId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.rpc('get_order_request_form', { p_token: token });
      if (cancelled) return;
      if (err || !data || !data.length) { setLoadState('invalid'); return; }
      setClinicName(data[0].clinic_name);
      setLoadState('ok');
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey(token)) || 'null');
        if (saved) setForm(f => ({ ...f, doctor_name: saved.doctor_name || '', doctor_phone: saved.doctor_phone || '' }));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));
  const setInput = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const showImplant =
    form.work_types.includes('Коронка на імпланті') ||
    form.work_types.includes('Індивідуальний абатмент') ||
    Object.values(form.teeth).includes('І');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.doctor_name.trim().length < 2 || form.patient_name.trim().length < 2) {
      setError(ERRORS.missing_fields);
      return;
    }
    setSubmitting(true);
    const details = {
      teeth: form.teeth,
      work_types: form.work_types, work_other: form.work_other.trim(),
      materials: form.materials, material_other: form.material_other.trim(),
      shade_system: form.shade_system, shade_main: form.shade_main.trim(),
      shade_incisal: form.shade_incisal.trim(), shade_body: form.shade_body.trim(),
      shade_cervical: form.shade_cervical.trim(), stump_shade: form.stump_shade.trim(),
      incisal_translucency: form.incisal_translucency, fissure_stain: form.fissure_stain, occlusion: form.occlusion,
      enclosed: form.enclosed,
      ...(showImplant ? {
        implant_system: form.implant_system.trim(), implant_platform: form.implant_platform.trim(),
        implant_fixation: form.implant_fixation, abutment_type: form.abutment_type,
      } : {}),
    };
    const payload = {
      doctor_name: form.doctor_name.trim(),
      doctor_phone: form.doctor_phone.trim(),
      patient_name: form.patient_name.trim(),
      patient_age: form.patient_age,
      patient_gender: form.patient_gender,
      impression_date: form.impression_date,
      try_in_date: form.try_in_date,
      due_date: form.due_date,
      due_time: form.due_time,
      urgent: form.urgent,
      notes: form.notes.trim(),
      details,
    };
    const { data, error: err } = await supabase.rpc('submit_order_request', {
      p_token: token, p_payload: payload, p_hp: hp,
    });
    setSubmitting(false);
    if (err) {
      const code = Object.keys(ERRORS).find(k => err.message?.includes(k));
      setError(code ? ERRORS[code] : 'Не вдалося надіслати наряд. Перевірте інтернет і спробуйте ще раз.');
      return;
    }
    try {
      localStorage.setItem(storageKey(token), JSON.stringify({ doctor_name: payload.doctor_name, doctor_phone: payload.doctor_phone }));
    } catch { /* ignore */ }
    setSentId(data || true);
    window.scrollTo({ top: 0 });
  };

  const startNew = () => {
    setForm(f => ({ ...emptyForm, doctor_name: f.doctor_name, doctor_phone: f.doctor_phone }));
    setSentId(null);
    setError('');
  };

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (loadState === 'invalid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-900">Посилання недійсне</h1>
        <p className="text-slate-500 mt-2">Зверніться до лабораторії за новим QR-кодом.</p>
        <a href="tel:+380669278019" className="mt-4 inline-flex items-center gap-2 text-slate-900 font-semibold">
          <Phone className="w-4 h-4" /> 066 927 80 19
        </a>
      </div>
    );
  }

  if (sentId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <CheckCircle2 className="w-14 h-14 text-emerald-600 mb-4" />
        <h1 className="text-xl font-bold text-slate-900">Наряд надіслано</h1>
        <p className="text-slate-500 mt-2">Лабораторія отримала наряд для пацієнта і зв'яжеться з вами за потреби.</p>
        <Button className="mt-6" onClick={startNew}>Новий наряд</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <form onSubmit={handleSubmit} className="max-w-xl mx-auto p-3 pb-28 space-y-3">
        <header className="flex items-center justify-between py-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Наряд-замовлення</h1>
            <p className="text-sm text-slate-500">{clinicName}</p>
          </div>
          <a href="tel:+380669278019" className="text-right text-xs text-slate-500">
            Лабораторія<br /><span className="text-sm font-semibold text-slate-900">066 927 80 19</span>
          </a>
        </header>

        {/* поле-пастка для ботів: людина його не бачить */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <label>Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={e => setHp(e.target.value)} /></label>
        </div>

        <Section title="Лікар і пацієнт">
          <Field label="ПІБ лікаря *"><Input value={form.doctor_name} onChange={setInput('doctor_name')} autoComplete="name" /></Field>
          <Field label="Телефон лікаря"><Input type="tel" value={form.doctor_phone} onChange={setInput('doctor_phone')} autoComplete="tel" /></Field>
          <Field label="ПІБ пацієнта *"><Input value={form.patient_name} onChange={setInput('patient_name')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Вік"><Input inputMode="numeric" value={form.patient_age} onChange={e => set('patient_age')(e.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>
            <div className="space-y-1">
              <span className="text-sm text-slate-600">Стать</span>
              <Chips options={['Чоловік', 'Жінка']} value={form.patient_gender} onChange={set('patient_gender')} />
            </div>
          </div>
        </Section>

        <Section title="Дати">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Відтиски / скан"><Input type="date" value={form.impression_date} onChange={setInput('impression_date')} /></Field>
            <Field label="Примірка"><Input type="date" value={form.try_in_date} onChange={setInput('try_in_date')} /></Field>
            <Field label="Здача"><Input type="date" value={form.due_date} onChange={setInput('due_date')} /></Field>
            <Field label="Час здачі"><Input type="time" value={form.due_time} onChange={setInput('due_time')} /></Field>
          </div>
          <button
            type="button"
            onClick={() => set('urgent')(!form.urgent)}
            className={`w-full py-2.5 rounded-xl border font-semibold text-sm ${form.urgent ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-300'}`}
          >
            {form.urgent ? '✓ ТЕРМІНОВО' : 'Терміново'}
          </button>
        </Section>

        <Section title="Зубна формула">
          <TeethPicker value={form.teeth} onChange={set('teeth')} />
        </Section>

        <Section title="Вид роботи">
          <Chips multiple options={WORK_TYPES} value={form.work_types} onChange={set('work_types')} />
          <Input placeholder="Інше" value={form.work_other} onChange={setInput('work_other')} />
        </Section>

        <Section title="Матеріал">
          <Chips multiple options={MATERIALS} value={form.materials} onChange={set('materials')} />
          <Input placeholder="Інше" value={form.material_other} onChange={setInput('material_other')} />
        </Section>

        <Section title="Колір">
          <Chips options={SHADE_SYSTEMS} value={form.shade_system} onChange={set('shade_system')} />
          <Field label="Основний колір">
            <Input className="h-14 text-2xl font-bold tracking-wide" value={form.shade_main} onChange={setInput('shade_main')} placeholder="напр. A2" />
          </Field>
          <div className="flex gap-3 items-stretch">
            <svg viewBox="0 0 46 54" className="w-14 shrink-0" aria-hidden="true">
              <defs><clipPath id="naryad-crown"><path d="M8 3 L38 3 Q41 3 41.5 6 L42 16 Q42 30 36 41 Q34.5 45 33.5 48 Q23 52 12.5 48 Q11.5 45 10 41 Q4 30 4 16 L4.5 6 Q5 3 8 3 Z" /></clipPath></defs>
              <g clipPath="url(#naryad-crown)">
                <rect width="46" height="15" fill="#f1f5f9" /><rect y="15" width="46" height="18" fill="#fff" /><rect y="33" width="46" height="21" fill="#e2e8f0" />
                <line x1="0" y1="15" x2="46" y2="15" stroke="#64748b" strokeWidth=".8" strokeDasharray="2 1.3" />
                <line x1="0" y1="33" x2="46" y2="33" stroke="#64748b" strokeWidth=".8" strokeDasharray="2 1.3" />
              </g>
              <path d="M8 3 L38 3 Q41 3 41.5 6 L42 16 Q42 30 36 41 Q34.5 45 33.5 48 Q23 52 12.5 48 Q11.5 45 10 41 Q4 30 4 16 L4.5 6 Q5 3 8 3 Z" fill="none" stroke="#0f172a" strokeWidth="1.4" />
            </svg>
            <div className="flex-1 space-y-2">
              <Input placeholder="Ріжучий край" value={form.shade_incisal} onChange={setInput('shade_incisal')} />
              <Input placeholder="Тіло" value={form.shade_body} onChange={setInput('shade_body')} />
              <Input placeholder="Шийка" value={form.shade_cervical} onChange={setInput('shade_cervical')} />
            </div>
          </div>
          <Field label="Колір кукси"><Input value={form.stump_shade} onChange={setInput('stump_shade')} /></Field>
        </Section>

        <Section title="Естетика">
          <Field label="Прозорість ріжучого краю"><Chips options={TRANSLUCENCY} value={form.incisal_translucency} onChange={set('incisal_translucency')} /></Field>
          <Field label="Фарбування фісур"><Chips options={FISSURES} value={form.fissure_stain} onChange={set('fissure_stain')} /></Field>
          <Field label="Оклюзійний контакт"><Chips options={OCCLUSION} value={form.occlusion} onChange={set('occlusion')} /></Field>
        </Section>

        {showImplant && (
          <Section title="Імплант">
            <Field label="Система"><Input value={form.implant_system} onChange={setInput('implant_system')} /></Field>
            <Field label="Діаметр / платформа"><Input value={form.implant_platform} onChange={setInput('implant_platform')} /></Field>
            <Field label="Фіксація"><Chips options={IMPLANT_FIXATION} value={form.implant_fixation} onChange={set('implant_fixation')} /></Field>
            <Field label="Абатмент"><Chips options={ABUTMENT_TYPES} value={form.abutment_type} onChange={set('abutment_type')} /></Field>
          </Section>
        )}

        <Section title="До наряду додається">
          <Chips multiple options={ENCLOSED} value={form.enclosed} onChange={set('enclosed')} />
        </Section>

        <Section title="Примітки">
          <Textarea rows={4} value={form.notes} onChange={setInput('notes')} maxLength={4000} />
        </Section>

        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3">
          <div className="max-w-xl mx-auto space-y-2">
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <Button type="submit" className="w-full h-12 text-base" disabled={submitting}>
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Надіслати наряд'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
