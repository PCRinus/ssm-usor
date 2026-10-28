import { Clock, Layers, Lock, type LucideIcon, ShieldCheck, Sprout } from 'lucide-react';

import type { SealKind } from './subscription-copy';

export const sealLooks: Record<
  SealKind,
  { icon: LucideIcon; className: string; iconClassName?: string }
> = {
  trial: {
    icon: Clock,
    className:
      'border border-dashed border-success-foreground/45 bg-success text-success-foreground',
  },
  start: { icon: Sprout, className: 'border border-input bg-card text-foreground' },
  profesional: {
    icon: ShieldCheck,
    className: 'bg-primary text-primary-foreground',
    iconClassName: 'text-accent',
  },
  enterprise: {
    icon: Layers,
    className:
      'bg-primary text-primary-foreground ring-[1.5px] ring-accent ring-offset-2 ring-offset-card',
    iconClassName: 'text-accent',
  },
  readOnly: {
    icon: Lock,
    className: 'border border-warning-border bg-warning text-warning-foreground',
  },
};
