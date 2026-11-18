import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useMatches } from '@tanstack/react-router';

import { backGap } from '@/components/back-gap';
import { BackLink } from '@/components/back-link';
import { phoneBleed, phoneStripInset } from '@/components/page-spacing';
import { TabSheet } from '@/components/tab-sheet';

export function ClientPending() {
  const fullPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.fullPage),
  });
  return (
    <div aria-busy="true">
      <div className={cn('mb-5 flex items-center', backGap)}>
        <div className="flex shrink-0">
          <BackLink to="/clienti" label="Înapoi la clienți" />
        </div>
        <Skeleton className="h-12 flex-1 rounded-lg" />
      </div>
      {!fullPage && (
        <>
          <div className={cn('pt-2', phoneBleed, phoneStripInset)}>
            <Skeleton className="h-10 w-full rounded-b-none" />
          </div>
          <TabSheet />
        </>
      )}
    </div>
  );
}
