import { Trans } from '@lingui/react/macro';
import { cn } from '@ssm-usor/ui/lib/utils';
import { createContext, type ReactNode, useContext } from 'react';

type FactsLayout = 'rows' | 'columns';

const FactsLayoutContext = createContext<FactsLayout>('columns');

export function Facts({
  layout = 'columns',
  testId,
  children,
}: {
  layout?: FactsLayout;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <FactsLayoutContext.Provider value={layout}>
      <dl
        data-testid={testId}
        className={cn(
          'grid gap-y-2.5 text-sm',
          layout === 'columns' && 'sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4 sm:text-[0.9375rem]'
        )}
      >
        {children}
      </dl>
    </FactsLayoutContext.Provider>
  );
}

export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  const columns = useContext(FactsLayoutContext) === 'columns';
  return (
    <div
      className={cn(
        'flex justify-between gap-4',
        columns && 'sm:flex-col sm:justify-start sm:gap-0.5'
      )}
    >
      <dt className={cn('shrink-0 text-muted-foreground', columns && 'sm:text-[0.8125rem]')}>
        {label}
      </dt>
      <dd className={cn('min-w-0 text-right font-medium break-words', columns && 'sm:text-left')}>
        {children ?? <NotFilled />}
      </dd>
    </div>
  );
}

export function NotFilled() {
  return (
    <span className="text-warning-foreground">
      <Trans>Necompletat</Trans>
    </span>
  );
}
