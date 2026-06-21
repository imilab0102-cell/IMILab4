import { useState } from 'react';

// Upper teeth: 18-11, 21-28
// Lower teeth: 48-41, 31-38
const UPPER_LEFT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_RIGHT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_RIGHT = [31, 32, 33, 34, 35, 36, 37, 38];

// Determine tooth type based on FDI number
function getToothType(number) {
  const ones = number % 10;
  // 1-3: incisors & canines, 4-5: premolars, 6-8: molars
  if (ones >= 1 && ones <= 3) return 'incisor-canine';
  if (ones >= 4 && ones <= 5) return 'premolar';
  if (ones >= 6 && ones <= 8) return 'molar';
  return 'molar';
}

// SVG tooth shapes – anatomically correct
function ToothSVG({ number, selected, onClick, color }) {
  const isLower = number >= 31;
  const fill = selected ? (color || '#2563eb') : 'white';
  const stroke = selected ? (color || '#2563eb') : '#9ca3af';
  const toothType = getToothType(number);

  // Get appropriate SVG path for each tooth type
  const getToothPath = (type) => {
    if (type === 'incisor-canine') {
      // Incisors and canines: narrower, more pointed
      return "M6 2 L8 1 L14 1 L16 2 L17 8 C17 12 16 18 15 22 C14 24 11 25 11 25 C11 25 8 24 7 22 C6 18 5 12 5 8 Z";
    } else if (type === 'premolar') {
      // Premolars: medium width, rounded top
      return "M5 2 C5 1 7 1 11 1 C15 1 17 2 17 3 L18 10 C18 15 17 20 15 23 C13 24.5 11 25 11 25 C11 25 9 24.5 7 23 C5 20 4 15 4 10 Z";
    } else {
      // Molars: wider, multiple cusps
      return "M3 3 C3 2 6 1 11 1 C16 1 19 2 19 3 L19 9 C19 14 18 19 16 23 C14 24.5 11 25 11 25 C11 25 8 24.5 6 23 C4 19 3 14 3 9 Z";
    }
  };

  return (
    <button
      type="button"
      onClick={() => onClick(number)}
      className="flex flex-col items-center gap-0.5 group focus:outline-none"
      title={`Зуб ${number}`}
    >
      {!isLower && (
        <span className="text-[9px] text-gray-500 font-medium leading-none">{number}</span>
      )}
      <svg
        width="22"
        height="26"
        viewBox="0 0 22 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="transition-all duration-150"
        style={{ transform: isLower ? 'scaleY(-1)' : 'none' }}
      >
        <path
          d={getToothPath(toothType)}
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
          className="group-hover:stroke-blue-500 transition-colors"
        />
      </svg>
      {isLower && (
        <span className="text-[9px] text-gray-500 font-medium leading-none">{number}</span>
      )}
    </button>
  );
}

export default function ToothChart({ selectedTeeth = [], onChange, color, teethColors = {} }) {
  const toggle = (num) => {
    if (selectedTeeth.includes(num)) {
      onChange(selectedTeeth.filter(t => t !== num));
    } else {
      onChange([...selectedTeeth, num]);
    }
  };

  const getToothColor = (toothNum) => {
    if (teethColors[toothNum]) {
      return teethColors[toothNum].color;
    }
    return color;
  };

  const row = (teeth) => (
    <div className="flex items-end gap-0.5">
      {teeth.map(n => (
        <ToothSVG
          key={n}
          number={n}
          selected={selectedTeeth.includes(n)}
          onClick={toggle}
          color={getToothColor(n)}
        />
      ))}
    </div>
  );

  return (
    <div className="select-none">
      {/* Upper row */}
      <div className="flex gap-1 justify-center mb-1">
        {row(UPPER_LEFT)}
        <div className="w-2" />
        {row(UPPER_RIGHT)}
      </div>
      {/* Lower row */}
      <div className="flex gap-1 justify-center mt-1">
        {row(LOWER_LEFT)}
        <div className="w-2" />
        {row(LOWER_RIGHT)}
      </div>
    </div>
  );
}