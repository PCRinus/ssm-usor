import { cn } from '@ssm-usor/ui/lib/utils';

import { tagCalendar } from './release-format';

type MonthsSize = 'dialog' | 'hero';
type MonthSize = 'sheet' | 'badge';

const monthsStyles = {
  dialog: {
    card: 'w-[152px] rounded-[12px_12px_10px_10px] shadow-[0_12px_28px_rgb(0_0_0/0.28)]',
    header: 'gap-[5px] px-3 pt-2.5 pb-[7px]',
    hole: 'size-3.5 shadow-[0_0_0_2px_var(--release-ring)]',
    year: 'text-[15px]',
    body: 'gap-3 px-3 pt-3 pb-3.5',
    grid: 'gap-x-1.5 gap-y-1',
    month: 'size-[26px] text-xs',
    version: 'text-lg',
  },
  hero: {
    card: 'w-32 rounded-[12px_12px_9px_9px] shadow-[0_10px_24px_rgb(0_0_0/0.3)]',
    header: 'gap-1 px-2.5 pt-[9px] pb-1.5',
    hole: 'size-3 shadow-[0_0_0_2px_var(--release-ring)]',
    year: 'text-[13px]',
    body: 'gap-2.5 px-2.5 pt-2.5 pb-3',
    grid: 'gap-x-1 gap-y-[3px]',
    month: 'size-[22px] text-[10px]',
    version: 'text-[15px]',
  },
} satisfies Record<MonthsSize, Record<string, string>>;

const monthStyles = {
  sheet: {
    card: 'h-[104px] w-[74px] origin-bottom rounded-[12px_12px_0_0]',
    header: 'gap-0.5 pt-1.5 pb-[3px]',
    hole: 'size-2.5 shadow-[0_0_0_1.5px_var(--release-ring)]',
    year: 'text-xs',
    month: 'size-10 text-base',
  },
  badge: {
    card: 'h-[70px] w-[50px] -rotate-4 rounded-[9px_9px_7px_7px]',
    header: 'gap-0.5 pt-1.5 pb-[3px]',
    hole: 'size-2 shadow-[0_0_0_1.5px_var(--release-ring)]',
    year: 'text-[10px]',
    month: 'size-7 text-xs',
  },
} satisfies Record<MonthSize, Record<string, string>>;

function TagHeader({
  year,
  styles,
}: {
  year: string;
  styles: { header: string; hole: string; year: string };
}) {
  return (
    <span className={cn('flex flex-col items-center bg-release-red text-white', styles.header)}>
      <span className={cn('rounded-full bg-release-sand', styles.hole)} />
      <span className={cn('font-bold tracking-[0.02em] tabular-nums', styles.year)}>{year}</span>
    </span>
  );
}

const months = Array.from({ length: 12 }, (_, index) => index + 1);

export function ReleaseTag({
  tag,
  size,
  label = false,
  className,
}: {
  tag: string;
  size: MonthsSize | MonthSize;
  label?: boolean;
  className?: string;
}) {
  const { year, month } = tagCalendar(tag);

  if (size === 'sheet' || size === 'badge') {
    const styles = monthStyles[size];
    return (
      <span
        aria-hidden="true"
        data-testid="release-tag"
        className={cn(
          'flex shrink-0 -rotate-3 flex-col overflow-hidden bg-release-paper text-foreground',
          styles.card,
          className
        )}
      >
        <TagHeader year={year} styles={styles} />
        <span className="flex flex-1 items-center justify-center">
          <span
            className={cn(
              'flex items-center justify-center rounded-full border-2 border-release-red font-bold text-release-red tabular-nums',
              styles.month
            )}
          >
            {month}
          </span>
        </span>
      </span>
    );
  }

  const styles = monthsStyles[size];
  return (
    <span
      aria-hidden="true"
      data-testid="release-tag"
      className={cn(
        'flex shrink-0 origin-top -rotate-3 flex-col overflow-hidden bg-release-paper text-foreground',
        styles.card,
        className
      )}
    >
      <TagHeader year={year} styles={styles} />
      <span className={cn('flex flex-col items-center', styles.body)}>
        <span className={cn('grid w-full grid-cols-4', styles.grid)}>
          {months.map((each) => (
            <span
              key={each}
              data-current={each === month || undefined}
              className={cn(
                'flex items-center justify-center justify-self-center rounded-full border-2 border-transparent font-medium tabular-nums',
                'data-current:border-release-red data-current:font-bold data-current:text-release-red',
                styles.month
              )}
            >
              {each}
            </span>
          ))}
        </span>
        <span className="h-px w-full bg-release-rule" />
        <span className="flex flex-col items-center gap-0.5">
          {label && (
            <span className="text-[11px] font-medium text-muted-foreground">Versiunea</span>
          )}
          <span
            className={cn(
              'leading-[1.1] font-bold tracking-[-0.01em] whitespace-nowrap tabular-nums',
              styles.version
            )}
          >
            {tag}
          </span>
        </span>
      </span>
    </span>
  );
}
