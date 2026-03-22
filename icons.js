// ═══════════════════════════════════════════
// BitWet — icons.js
// Custom weather SVG icons + UI icons
// ═══════════════════════════════════════════

function wxLabel(c) {
  if (c == null) return '—';
  if (c <= 1) return 'Sunny';
  if (c <= 3) return 'Partially Sunny';
  if (c <= 48) return 'Foggy';
  if (c <= 55) return 'Drizzle';
  if (c <= 57) return 'Freezing Drizzle';
  if (c <= 65) return 'Rain';
  if (c <= 67) return 'Freezing Rain';
  if (c <= 75) return 'Snow';
  if (c <= 77) return 'Snow Grains';
  if (c <= 82) return 'Heavy rain';
  if (c <= 86) return 'Snow showers';
  if (c >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

function wxSVG(c) {
  if (c == null) return '';
  const a = 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  if (c <= 1) return `<svg viewBox="0 0 24 24" ${a}><path d="M12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18Z"/><path d="M22 12L23 12"/><path d="M12 2V1"/><path d="M12 23V22"/><path d="M20 20L19 19"/><path d="M20 4L19 5"/><path d="M4 20L5 19"/><path d="M4 4L5 5"/><path d="M1 12L2 12"/></svg>`;
  if (c <= 3) return `<svg viewBox="0 0 24 24" ${a}><path d="M6 13C4.33333 13 1 14 1 18C1 22 4.33333 23 6 23H18C19.6667 23 23 22 23 18C23 14 19.6667 13 18 13"/><path d="M12 12C13.6569 12 15 10.6569 15 9C15 7.34315 13.6569 6 12 6C10.3431 6 9 7.34315 9 9C9 10.6569 10.3431 12 12 12Z"/><path d="M19 9L20 9"/><path d="M12 2V1"/><path d="M18.5 3.5L17.5 4.5"/><path d="M5.5 3.5L6.5 4.5"/><path d="M4 9L5 9"/></svg>`;
  if (c <= 48) return `<svg viewBox="0 0 24 24" ${a}><path d="M9 14H15"/><path d="M9 22H15"/><path d="M7 18H17"/><path d="M3.5 17.3818C2.1879 16.7066 1 15.3879 1 13C1 9 4.33333 8 6 8C6 6 6 2 12 2C18 2 18 6 18 8C19.6667 8 23 9 23 13C23 15.3879 21.8121 16.7066 20.5 17.3818"/></svg>`;
  if (c <= 57) return `<svg viewBox="0 0 24 24" ${a}><path d="M12 14V16"/><path d="M12 20V22"/><path d="M8 18V20"/><path d="M16 18V20"/><path d="M20 17.6073C21.4937 17.0221 23 15.6889 23 13C23 9 19.6667 8 18 8C18 6 18 2 12 2C6 2 6 6 6 8C4.33333 8 1 9 1 13C1 15.6889 2.50628 17.0221 4 17.6073"/></svg>`;
  if (c <= 67) return `<svg viewBox="0 0 24 24" ${a}><path d="M12 14V16"/><path d="M12 20V22"/><path d="M8 18V20"/><path d="M16 18V20"/><path d="M20 17.6073C21.4937 17.0221 23 15.6889 23 13C23 9 19.6667 8 18 8C18 6 18 2 12 2C6 2 6 6 6 8C4.33333 8 1 9 1 13C1 15.6889 2.50628 17.0221 4 17.6073"/></svg>`;
  if (c <= 77) return `<svg viewBox="0 0 24 24" ${a}><path d="M12 12L12 17M12 22L12 17M12 17L7.5 14.5M12 17L16.5 19.5M12 17L16.5 14.5M12 17L7.5 19.5"/><path d="M20 17.6073C21.4937 17.0221 23 15.6889 23 13C23 9 19.6667 8 18 8C18 6 18 2 12 2C6 2 6 6 6 8C4.33333 8 1 9 1 13C1 15.6889 2.50628 17.0221 4 17.6073"/></svg>`;
  if (c <= 82) return `<svg viewBox="0 0 24 24" ${a}><path d="M8 13V20"/><path d="M16 13V20"/><path d="M12 15V22"/><path d="M20 17.6073C21.4937 17.0221 23 15.6889 23 13C23 9 19.6667 8 18 8C18 6 18 2 12 2C6 2 6 6 6 8C4.33333 8 1 9 1 13C1 15.6889 2.50628 17.0221 4 17.6073"/></svg>`;
  if (c <= 86) return `<svg viewBox="0 0 24 24" ${a}><path d="M12 12L12 17M12 22L12 17M12 17L7.5 14.5M12 17L16.5 19.5M12 17L16.5 14.5M12 17L7.5 19.5"/><path d="M20 17.6073C21.4937 17.0221 23 15.6889 23 13C23 9 19.6667 8 18 8C18 6 18 2 12 2C6 2 6 6 6 8C4.33333 8 1 9 1 13C1 15.6889 2.50628 17.0221 4 17.6073"/></svg>`;
  if (c >= 95) return `<svg viewBox="0 0 24 24" ${a}><path d="M11.5 12L9 17H15L12.5 22"/><path d="M20 17.6073C21.4937 17.0221 23 15.6889 23 13C23 9 19.6667 8 18 8C18 6 18 2 12 2C6 2 6 6 6 8C4.33333 8 1 9 1 13C1 15.6889 2.50628 17.0221 4 17.6073"/></svg>`;
  return `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"><path d="M12 4C6 4 6 8 6 10C4.33333 10 1 11 1 15C1 19 4.33333 20 6 20H18C19.6667 20 23 19 23 15C23 11 19.6667 10 18 10C18 8 18 4 12 4Z"/></svg>`;
}

const ICON = {
  usuals: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z"/><path d="M4.271 18.3457C4.271 18.3457 6.50002 15.5 12 15.5C17.5 15.5 19.7291 18.3457 19.7291 18.3457"/><path d="M12 12C13.6569 12 15 10.6569 15 9C15 7.34315 13.6569 6 12 6C10.3431 6 9 7.34315 9 9C9 10.6569 10.3431 12 12 12Z"/></svg>`,
  explore: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5857 10.5857L16.9496 7.0502L13.4141 13.4142L7.05012 16.9497L10.5857 10.5857Z"/><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/></svg>`,
  addOne: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19L3.78974 20.7368C3.40122 20.8663 3 20.5771 3 20.1675L3 5.43246C3 5.1742 3.16526 4.94491 3.41026 4.86325L9 3M9 19L15 21M9 19L9 3M15 21L20.5897 19.1368C20.8347 19.0551 21 18.8258 21 18.5675L21 3.83246C21 3.42292 20.5988 3.13374 20.2103 3.26325L15 5M15 21L15 5M15 5L9 3"/></svg>`,

  planner: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2m0 2v2m0-2h-4.5M3 10v9a2 2 0 002 2h14a2 2 0 002-2v-9H3zM3 10V6a2 2 0 012-2h2M7 2v4M21 10V6a2 2 0 00-2-2h-.5"/></svg>`,
};
