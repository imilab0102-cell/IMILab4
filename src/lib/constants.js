export const WORK_CATEGORIES = [
  'Металокераміка',
  'Безметалова кераміка',
  'Знімне протезування',
  'Ортодонтія',
  'CAD/CAM',
  'Інше',
];

export const VITA_COLORS = [
  'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4',
  'D2', 'D3', 'D4',
  'Bleach BL1', 'Bleach BL2', 'Bleach BL3', 'Bleach BL4'
];

export const ORDER_STATUSES = [
  'Новий', 'В роботі', 'На примірці', 'Готовий', 'Зданий', 'Скасований'
];

export const STATUS_COLORS = {
  'Новий': 'bg-blue-100 text-blue-700 border-blue-200',
  'В роботі': 'bg-amber-100 text-amber-700 border-amber-200',
  'На примірці': 'bg-purple-100 text-purple-700 border-purple-200',
  'Готовий': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Зданий': 'bg-slate-100 text-slate-600 border-slate-200',
  'Скасований': 'bg-red-100 text-red-600 border-red-200',
};

export function generateOrderNumber() {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 9000) + 1000;
  return `Н-${year}-${seq}`;
}