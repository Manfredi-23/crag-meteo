'use client';

import { type ReactNode } from 'react';
import { usePlatform } from '@/hooks/usePlatform';
import { type Platform } from '@/lib/platform';

interface PlatformGateProps {
  platform: Platform;
  children: ReactNode;
}

export function PlatformGate({ platform, children }: PlatformGateProps) {
  const current = usePlatform();
  if (current !== platform) return null;
  return <>{children}</>;
}
