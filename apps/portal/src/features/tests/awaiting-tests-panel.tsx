import { Trans, useLingui } from '@lingui/react/macro';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ChevronRight, ClipboardCheck } from 'lucide-react';

import { useGetPortalTests } from '@/api/generated/api';
import { cardClass } from '@/components/page';
import { testAwaitingMessage } from '@/lib/labels';
import { useApiRequest } from '@/lib/request';

import { awaitingTestsOf } from './awaiting-tests';

export function AwaitingTestsPanel({ participantId }: { participantId: string }) {
  const { t, i18n } = useLingui();
  const apiRequest = useApiRequest();
  const tests = useGetPortalTests(participantId, { request: apiRequest });
  const awaiting = tests.data ? awaitingTestsOf(tests.data) : [];
  if (awaiting.length === 0) return null;

  return (
    <section
      aria-labelledby="home-tests-title"
      data-testid="home-tests"
      className={cn(cardClass, 'grid gap-2 border-primary/25 px-4 pt-4 pb-2 sm:px-5 sm:pt-5')}
    >
      <h2 id="home-tests-title" className="text-base font-semibold sm:text-[1.0625rem]">
        <Trans>Teste</Trans>
      </h2>
      <ul className="-mx-2 grid divide-y">
        {awaiting.map(({ domain, test, inProgress }) => (
          <li key={`${domain}-${test}`}>
            <Link
              to="/instruiri/test/$domain/$test"
              params={{ domain, test }}
              data-testid="home-test-item"
              data-domain={domain}
              data-test={test}
              className="flex min-h-14 items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                <ClipboardCheck aria-hidden="true" className="size-4" />
              </span>
              <span className="grid flex-1 gap-0.5">
                <span className="text-[0.9375rem] font-medium">
                  {i18n._(testAwaitingMessage(domain, test))}
                </span>
                <span className="text-sm text-muted-foreground">
                  {inProgress
                    ? t`Ai început testul; continui de unde ai rămas.`
                    : t`Zece întrebări, fără limită de timp.`}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
