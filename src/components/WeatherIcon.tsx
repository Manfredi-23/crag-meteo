'use client';

import React from 'react';

/** Common SVG stroke attributes shared by all weather icons */
const strokeProps = {
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
};

/** Cloud base path shared by most weather codes */
function CloudBase() {
  return (
    <path d="M20 17.6073C21.4937 17.0221 23 15.6889 23 13C23 9 19.6667 8 18 8C18 6 18 2 12 2C6 2 6 6 6 8C4.33333 8 1 9 1 13C1 15.6889 2.50628 17.0221 4 17.6073" />
  );
}

/** Sunny — codes 0–1 */
function SunnyIcon() {
  return (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18Z" />
      <path d="M22 12L23 12" />
      <path d="M12 2V1" />
      <path d="M12 23V22" />
      <path d="M20 20L19 19" />
      <path d="M20 4L19 5" />
      <path d="M4 20L5 19" />
      <path d="M4 4L5 5" />
      <path d="M1 12L2 12" />
    </svg>
  );
}

/** Partially sunny — codes 2–3 */
function PartiallySunnyIcon() {
  return (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M6 13C4.33333 13 1 14 1 18C1 22 4.33333 23 6 23H18C19.6667 23 23 22 23 18C23 14 19.6667 13 18 13" />
      <path d="M12 12C13.6569 12 15 10.6569 15 9C15 7.34315 13.6569 6 12 6C10.3431 6 9 7.34315 9 9C9 10.6569 10.3431 12 12 12Z" />
      <path d="M19 9L20 9" />
      <path d="M12 2V1" />
      <path d="M18.5 3.5L17.5 4.5" />
      <path d="M5.5 3.5L6.5 4.5" />
      <path d="M4 9L5 9" />
    </svg>
  );
}

/** Foggy — codes 4–48 */
function FoggyIcon() {
  return (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M9 14H15" />
      <path d="M9 22H15" />
      <path d="M7 18H17" />
      <path d="M3.5 17.3818C2.1879 16.7066 1 15.3879 1 13C1 9 4.33333 8 6 8C6 6 6 2 12 2C18 2 18 6 18 8C19.6667 8 23 9 23 13C23 15.3879 21.8121 16.7066 20.5 17.3818" />
    </svg>
  );
}

/** Drizzle / Freezing Drizzle — codes 49–67 (light rain) */
function DrizzleIcon() {
  return (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M12 14V16" />
      <path d="M12 20V22" />
      <path d="M8 18V20" />
      <path d="M16 18V20" />
      <CloudBase />
    </svg>
  );
}

/** Snow / Snow Grains — codes 68–77 */
function SnowIcon() {
  return (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M12 12L12 17M12 22L12 17M12 17L7.5 14.5M12 17L16.5 19.5M12 17L16.5 14.5M12 17L7.5 19.5" />
      <CloudBase />
    </svg>
  );
}

/** Heavy rain — codes 78–82 */
function HeavyRainIcon() {
  return (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M8 13V20" />
      <path d="M16 13V20" />
      <path d="M12 15V22" />
      <CloudBase />
    </svg>
  );
}

/** Snow showers — codes 83–86 (same SVG as snow) */
function SnowShowersIcon() {
  return (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M12 12L12 17M12 22L12 17M12 17L7.5 14.5M12 17L16.5 19.5M12 17L16.5 14.5M12 17L7.5 19.5" />
      <CloudBase />
    </svg>
  );
}

/** Thunderstorm — codes 95+ */
function ThunderstormIcon() {
  return (
    <svg viewBox="0 0 24 24" {...strokeProps}>
      <path d="M11.5 12L9 17H15L12.5 22" />
      <CloudBase />
    </svg>
  );
}

/** Cloudy — default fallback */
function CloudyIcon() {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" fill="none">
      <path d="M12 4C6 4 6 8 6 10C4.33333 10 1 11 1 15C1 19 4.33333 20 6 20H18C19.6667 20 23 19 23 15C23 11 19.6667 10 18 10C18 8 18 4 12 4Z" />
    </svg>
  );
}

/**
 * Resolves a WMO weather code to the corresponding SVG icon component.
 * Mapping matches icons.js wxSVG exactly.
 */
function getIconForCode(code: number | null | undefined): React.ReactNode {
  if (code == null) return null;
  if (code <= 1) return <SunnyIcon />;
  if (code <= 3) return <PartiallySunnyIcon />;
  if (code <= 48) return <FoggyIcon />;
  if (code <= 57) return <DrizzleIcon />;
  if (code <= 67) return <DrizzleIcon />;       // Freezing rain uses same icon as drizzle
  if (code <= 77) return <SnowIcon />;
  if (code <= 82) return <HeavyRainIcon />;
  if (code <= 86) return <SnowShowersIcon />;
  if (code >= 95) return <ThunderstormIcon />;
  return <CloudyIcon />;
}

/** Props for the WeatherIcon component */
interface WeatherIconProps {
  /** WMO weather code (0–99) */
  weatherCode: number | null | undefined;
  /** Optional CSS class name */
  className?: string;
  /** Optional inline style */
  style?: React.CSSProperties;
}

/**
 * Renders an inline SVG weather icon for the given WMO weather code.
 * All icons render at the size of their container (viewBox-based).
 */
export default function WeatherIcon({ weatherCode, className, style }: WeatherIconProps) {
  const icon = getIconForCode(weatherCode);
  if (!icon) return null;
  return (
    <span className={className} style={{ display: 'inline-flex', ...style }}>
      {icon}
    </span>
  );
}

/** Weather code to text interpretation mapping (re-exported from scoring.ts for convenience) */
export { wxLabel } from '@/lib/scoring';
