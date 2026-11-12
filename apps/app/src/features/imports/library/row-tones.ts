import type { Tone } from './decision-row';

export const rowTones: Partial<Record<Tone, string>> = {
  todo: 'bg-warning/40',
  editing: 'bg-info/60 shadow-[inset_0_0_0_2px_var(--color-ring)]',
};
