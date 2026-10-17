import { trainingDomainLabels, trainingDomains } from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

import type { PortalTrainingRecordsResponse } from '@/api/generated/api';
import { formatDate } from '@/lib/format';

import { TrainingStateBadge } from './training-state-badge';

export function TrainingSummary({ records }: { records: PortalTrainingRecordsResponse }) {
  return (
    <section aria-labelledby="training-summary-title" className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="training-summary-title" className="text-lg font-semibold">
          Instruirea ta
        </h2>
        <Link
          to="/instruiri"
          data-testid="training-summary-link"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          Vezi instruirile
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {trainingDomains.map((domain) => {
          const status = records.training[domain];
          const last = records.items.find((record) => record.domain === domain);
          return (
            <div
              key={domain}
              data-testid={`training-summary-${domain}`}
              className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{trainingDomainLabels[domain]}</h3>
                {status.state && (
                  <TrainingStateBadge state={status.state} testId={`training-state-${domain}`} />
                )}
              </div>
              <dl className="grid gap-2 text-sm">
                <div className="grid gap-0.5">
                  <dt className="text-muted-foreground">Următoarea instruire</dt>
                  <dd data-testid={`training-due-${domain}`} className="font-medium tabular-nums">
                    {status.dueOn ? formatDate(status.dueOn) : 'Nestabilită'}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-muted-foreground">Ultima instruire</dt>
                  <dd data-testid={`training-last-${domain}`} className="font-medium tabular-nums">
                    {last ? formatDate(last.heldOn) : 'Niciuna încă'}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}
