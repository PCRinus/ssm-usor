import type { DocumentStatus } from './pack-status';

export const statusTone: Record<DocumentStatus, string> = {
  issued: 'bg-primary',
  update: 'bg-warning-border',
  draft: 'bg-info-border',
  missing: 'bg-muted',
};

export const warningBadge = 'border-warning-border bg-warning text-warning-foreground';

export const packCells = {
  title: 'min-w-52 whitespace-normal px-3 py-3',
  status: 'whitespace-normal px-3',
  date: 'text-muted-foreground tabular-nums px-3',
  actions: 'w-11',
} as const;
