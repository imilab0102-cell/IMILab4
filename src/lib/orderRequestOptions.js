// Варіанти для онлайн-наряду від лікаря (ті самі, що й на паперовому бланку)

export const PUBLIC_APP_URL = 'https://imi-lab4.vercel.app';

export const buildRequestLink = (token) => `${PUBLIC_APP_URL}/p/naryad/${token}`;

export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export const TOOTH_MARKS = [
  { code: 'К', label: 'Коронка', hex: '#2563eb', color: 'bg-blue-600 text-white border-blue-600' },
  { code: 'П', label: 'Проміжна частина', hex: '#7c3aed', color: 'bg-violet-600 text-white border-violet-600' },
  { code: 'В', label: 'Вінір', hex: '#db2777', color: 'bg-pink-600 text-white border-pink-600' },
  { code: 'І', label: 'Імплант', hex: '#059669', color: 'bg-emerald-600 text-white border-emerald-600' },
  { code: 'Т', label: 'Тимчасова', hex: '#f59e0b', color: 'bg-amber-500 text-white border-amber-500' },
  { code: 'Х', label: 'Відсутній', hex: '#64748b', color: 'bg-slate-500 text-white border-slate-500' },
];

export const markByCode = (code) => TOOTH_MARKS.find(m => m.code === code);

export const WORK_TYPES = [
  'Коронка',
  'Міст',
  'Вінір',
  'WaxUp / Mock-up',
  'Бюгельний протез',
  'Коронка на імпланті',
  'Індивідуальний абатмент',
  'Тимчасова конструкція',
  'Знімний протез',
  'Капа / сплінт',
];

export const MATERIALS = [
  'Цирконій моноліт',
  'Цирконій мультилеєр',
  'Цирконій + кераміка',
  'E.max прес',
  'Полевошпатна кераміка',
  'Металокераміка',
  'Титан',
  'PMMA',
  'Композит',
  'Акрил / нейлон',
];

export const SHADE_SYSTEMS = ['VITA Classical', 'VITA 3D-Master'];
export const TRANSLUCENCY = ['Прозорий', 'Середній', 'Непрозорий'];
export const FISSURES = ['Сильно', 'Середньо', 'Без фарбування'];
export const OCCLUSION = ['Щільна', 'Легка', 'Без контакту'];
export const IMPLANT_FIXATION = ['Гвинтова', 'Цементна'];
export const ABUTMENT_TYPES = ['Стандартний', 'Індивідуальний', 'Ti-base'];

export const ENCLOSED = [
  'Відтиски',
  'Скан (STL)',
  'Моделі',
  'Аналоги',
  'Регістрат прикусу',
  'Лицьова дуга',
  'WaxUp',
  'Тимчасові / старі роботи',
];

export const REQUEST_STATUSES = ['Новий', 'Прийнято', 'Відхилено'];

// Текстовий підсумок заявки — для нотаток наряду
export function summarizeRequest(r) {
  const d = r?.details || {};
  const lines = [];
  const teeth = Object.entries(d.teeth || {});
  if (teeth.length) {
    const byMark = {};
    teeth.forEach(([t, m]) => { (byMark[m] = byMark[m] || []).push(t); });
    lines.push('Зуби: ' + Object.entries(byMark).map(([m, ts]) => `${m} ${ts.sort().join(', ')}`).join(' · '));
  }
  const works = [...(d.work_types || []), d.work_other].filter(Boolean);
  if (works.length) lines.push('Робота: ' + works.join(', '));
  const mats = [...(d.materials || []), d.material_other].filter(Boolean);
  if (mats.length) lines.push('Матеріал: ' + mats.join(', '));
  const shade = [
    d.shade_main && `основний ${d.shade_main}`,
    d.shade_incisal && `ріж. край ${d.shade_incisal}`,
    d.shade_body && `тіло ${d.shade_body}`,
    d.shade_cervical && `шийка ${d.shade_cervical}`,
    d.stump_shade && `кукса ${d.stump_shade}`,
  ].filter(Boolean);
  if (shade.length) lines.push(`Колір${d.shade_system ? ` (${d.shade_system})` : ''}: ` + shade.join(', '));
  const aest = [
    d.incisal_translucency && `ріж. край ${d.incisal_translucency.toLowerCase()}`,
    d.fissure_stain && `фісури ${d.fissure_stain.toLowerCase()}`,
    d.occlusion && `оклюзія ${d.occlusion.toLowerCase()}`,
  ].filter(Boolean);
  if (aest.length) lines.push('Естетика: ' + aest.join(', '));
  const impl = [
    d.implant_system, d.implant_platform,
    d.implant_fixation && `фіксація ${d.implant_fixation.toLowerCase()}`,
    d.abutment_type && `абатмент ${d.abutment_type}`,
  ].filter(Boolean);
  if (impl.length) lines.push('Імплант: ' + impl.join(', '));
  if ((d.enclosed || []).length) lines.push('Додається: ' + d.enclosed.join(', '));
  if (r?.try_in_date) lines.push('Примірка: ' + r.try_in_date);
  if (r?.impression_date) lines.push('Відтиски/скан: ' + r.impression_date);
  if (r?.doctor_phone) lines.push('Тел. лікаря: ' + r.doctor_phone);
  if (r?.notes) lines.push('Примітки лікаря: ' + r.notes);
  return lines.join('\n');
}
