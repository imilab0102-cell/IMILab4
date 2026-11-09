// Права техніка, які налаштовує власник (зберігаються в technician.permissions).
// Ті самі ключі та значення за замовчуванням, що й у функції бази tech_default_permissions().

export const TECH_PERMISSIONS = [
  { key: 'change_status', label: 'Змінювати статус своїх нарядів', hint: '«В роботі», «На примірці», «Готовий»', default: true },
  { key: 'add_notes', label: 'Дописувати примітки', hint: 'До своїх нарядів, з підписом і часом', default: false },
  { key: 'see_earnings', label: 'Бачити свій заробіток і виплати', hint: 'Оплата за наряд, сума за місяць, виплати', default: true },
  { key: 'see_services', label: 'Бачити свої ставки', hint: 'Вкладка «Мої послуги»', default: true },
  { key: 'see_all_orders', label: 'Бачити всі наряди лабораторії', hint: 'Не лише свої; без цін і без чужого заробітку', default: false },
  { key: 'see_patient', label: 'Бачити ПІБ пацієнта', hint: 'Якщо вимкнено — «Пацієнт приховано»', default: true },
  { key: 'see_clinic_doctor', label: 'Бачити клініку та лікаря', hint: '', default: true },
  { key: 'see_files', label: 'Бачити файли та фото', hint: '', default: true },
  { key: 'full_orders', label: 'Наряди як у власника (з цінами)', hint: 'Усі наряди з цінами клініки; створює, редагує, видаляє', default: false },
  { key: 'create_orders', label: 'Створювати нові наряди', hint: 'Без цін; ви потім перевіряєте ціни та зберігаєте наряд', default: false },
  { key: 'add_external', label: 'Зовнішні лабораторії (як у власника)', hint: 'Усі лабораторії й замовлення з цінами; може додавати та редагувати', default: false },
  { key: 'adjust_salary', label: 'Коригувати свою зарплату', hint: 'Додавати бонуси/утримання з поміткою «від техніка»', default: false },
];

export const defaultPermissions = () =>
  Object.fromEntries(TECH_PERMISSIONS.map(p => [p.key, p.default]));

export const withDefaults = (perms) => ({ ...defaultPermissions(), ...(perms || {}) });
