import { cn } from '@ssm-usor/ui/lib/utils';

// Same surface as Input; hover only strengthens the border.
export const comboboxTriggerClass = cn(
  'flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-ring/60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
  'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40'
);
