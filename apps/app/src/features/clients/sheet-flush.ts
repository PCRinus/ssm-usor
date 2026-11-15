import { cn } from '@ssm-usor/ui/lib/utils';

// A tab whose content is one list or one card: a panel around it would be a box inside the box
// (ClientSheet), so it runs edge to edge in the sheet. A visually hidden heading before it takes
// no room, so the list still meets the tab.
export const sheetFlushList = cn(
  'overflow-hidden border-t bg-card -mx-(--sheet-pad)',
  'first:-mt-(--sheet-pad) first:border-t-0 [.sr-only:first-child+&]:-mt-(--sheet-pad) [.sr-only:first-child+&]:border-t-0',
  'last:-mb-(--sheet-pad) last:rounded-b-[calc(var(--radius-xl)-1px)] max-sm:last:rounded-none'
);

export const sheetFlushCard = cn('rounded-none border-x-0 border-b-0 shadow-none', sheetFlushList);
