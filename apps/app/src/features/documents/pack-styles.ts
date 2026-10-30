import type { DocumentStatus } from './pack-status';

export const statusTone: Record<DocumentStatus, string> = {
  issued: 'bg-primary',
  update: 'bg-warning-border',
  draft: 'bg-info-border',
  missing: 'bg-muted',
};

export const packCells = {
  row: 'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-2 max-md:gap-y-2 max-md:py-3.5 max-md:pr-1.5 max-md:pl-4',
  title: 'whitespace-normal md:px-3 md:py-3 max-md:col-start-1 max-md:row-start-1 max-md:p-0',
  status:
    'whitespace-normal md:px-3 max-md:col-start-1 max-md:row-start-2 max-md:self-center max-md:p-0',
  date: 'text-muted-foreground tabular-nums md:px-3 max-md:col-start-2 max-md:row-start-2 max-md:self-center max-md:p-0 max-md:pr-2.5 max-md:text-right max-md:text-xs',
  actions: 'md:w-11 max-md:col-start-2 max-md:row-start-1 max-md:-my-1.5 max-md:p-0',
} as const;
