import type { MeterTone } from './sms-copy';

export const toneFills: Record<MeterTone, string> = {
  normal: 'bg-ring',
  warning: 'bg-warning-border',
  over: 'bg-chart-3',
  danger: 'bg-destructive',
};

export const toneInks: Record<MeterTone, string | null> = {
  normal: null,
  warning: 'text-warning-foreground',
  over: 'text-warning-foreground',
  danger: 'text-destructive-foreground',
};
