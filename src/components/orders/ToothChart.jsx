import React from 'react';

// FDI Tooth Numbering Groups
const UPPER_LEFT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_RIGHT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_RIGHT = [31, 32, 33, 34, 35, 36, 37, 38];

// Функція для автоматичного імпорту зображень
// Назви мають бути: 11.png, 12.png ... 48.png у папці src/assets/teeth/
const getToothImage = (num) => {
  try {
    return new URL(`../../assets/teeth/${num}.png`, import.meta.url).href;
  } catch (e) {
    return null;
  }
};

function Tooth({ number, selected, onClick, colors = [] }) {
  const imageSrc = getToothImage(number);

  // Створюємо фон для декількох кольорів (градієнт)
  let backgroundColor = colors.length > 0 ? colors[0] : '#3b82f6';
  if (colors.length > 1) {
    const step = 100 / colors.length;
    const gradientParts = colors.map((c, i) => `${c} ${i * step}%, ${c} ${(i + 1) * step}%`);
    backgroundColor = `linear-gradient(to bottom, ${gradientParts.join(', ')})`;
  }

  const overlayStyle = selected ? {
    filter: `brightness(0.8) contrast(1.2)`,
    background: backgroundColor,
    WebkitMaskImage: `url(${imageSrc})`,
    maskImage: `url(${imageSrc})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat'
  } : {};

  return (
    <div
      onClick={() => onClick(number)}
      className="flex flex-col items-center cursor-pointer group px-[1px]"
    >
      <div className={`w-9 h-12 rounded-md border flex flex-col items-center justify-center transition-all ${
        selected ? 'bg-slate-100 border-blue-300' : 'bg-white border-transparent hover:bg-slate-50'
      }`}>
        <span className={`text-[9px] font-black mb-0.5 ${selected ? 'text-blue-600' : 'text-slate-400'}`}>
          {number}
        </span>

        <div className="relative w-7 h-7 flex items-center justify-center">
          {/* Оригінальна реалістична картинка зуба (прозора при виборі) */}
          <img
            src={imageSrc}
            alt={number}
            className={`w-full h-full object-contain transition-opacity duration-200 ${selected ? 'opacity-0' : 'opacity-100'}`}
          />

          {/* Зафарбований шар (з'являється при виборі) */}
          {selected && (
            <div
              className="absolute inset-0 w-full h-full transition-all duration-200"
              style={overlayStyle}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function ToothChart({ selectedTeeth = [], onChange, color, teethColors = {} }) {
  const toggle = (num) => onChange(num);

  const renderRow = (teeth) => (
    <div className="flex items-center">
      {teeth.map(n => {
        const toothData = teethColors[n];
        const colors = Array.isArray(toothData?.colors) ? toothData.colors : (toothData?.color ? [toothData.color] : []);

        return (
          <Tooth
            key={n}
            number={n}
            selected={selectedTeeth.includes(n)}
            colors={colors.length > 0 ? colors : [color]}
            onClick={toggle}
          />
        );
      })}
    </div>
  );

  return (
    <div className="select-none p-2 bg-[#f0f2f5] rounded-xl border border-slate-200 inline-block shadow-inner">
      <div className="space-y-3">
        {/* Upper Row */}
        <div className="flex justify-center items-center">
          {renderRow(UPPER_LEFT)}
          <div className="w-1 h-10 bg-slate-300 mx-1.5 rounded-full opacity-40" />
          {renderRow(UPPER_RIGHT)}
        </div>

        {/* Lower Row */}
        <div className="flex justify-center items-center">
          {renderRow(LOWER_LEFT)}
          <div className="w-1 h-10 bg-slate-300 mx-1.5 rounded-full opacity-40" />
          {renderRow(LOWER_RIGHT)}
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-12 text-[10px] font-black text-slate-400 uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span>Ліва сторона (R)</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Права сторона (L)</span>
          <div className="w-2 h-2 rounded-full bg-blue-400" />
        </div>
      </div>
    </div>
  );
}
