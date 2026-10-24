import { cn } from '@ssm-usor/ui/lib/utils';

import { DashboardItem, type DashboardItemProps } from './dashboard-item';

export const cardClass = 'rounded-2xl border bg-card text-card-foreground shadow-xs';

export const headingClass = 'text-[17px] font-semibold tracking-[-0.01em]';

export type CardItem = Omit<DashboardItemProps, 'tone' | 'surface'> & { count: number };

export function ItemsCard({ id, title, items }: { id: string; title: string; items: CardItem[] }) {
  return (
    <section
      aria-labelledby={id}
      data-testid={id}
      className={cn(cardClass, 'px-4 pt-4 pb-1 sm:px-5 sm:pt-[18px] sm:pb-1.5')}
    >
      <h2 id={id} className={cn(headingClass, 'mb-0.5 sm:mb-1.5')}>
        {title}
      </h2>
      {items.map((item, index) => (
        <div key={item.testId ?? item.label} className={cn(index > 0 && 'border-t border-muted')}>
          <DashboardItem tone="ink" surface="row" {...item} />
        </div>
      ))}
    </section>
  );
}
