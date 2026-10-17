import { Trans, useLingui } from '@lingui/react/macro';
import { type TrainingDomain, trainingDomains } from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';

import type {
  PortalTrainingRecordsResponse,
  PortalTrainingSheetsResponse,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { cardClass } from '@/components/page';
import { useFormatDate } from '@/lib/format';
import { trainingDomainMessages } from '@/lib/labels';

import { TrainingStateBadge } from './training-state-badge';
import { type LoadSheet, useSheetActions } from './use-sheet-actions';

type SheetAccess = {
  sheets: PortalTrainingSheetsResponse | undefined;
  loadSheet: LoadSheet;
  onStale: () => void;
};

export function TrainingSummary({
  records,
  sheetAccess,
}: {
  records: PortalTrainingRecordsResponse;
  sheetAccess: SheetAccess;
}) {
  return (
    <section aria-labelledby="training-summary-title" className="grid gap-3 sm:gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="training-summary-title"
          className="text-lg font-semibold tracking-tight sm:text-[1.1875rem]"
        >
          <Trans>Instruirea ta</Trans>
        </h2>
        <Link
          to="/instruiri"
          data-testid="training-summary-link"
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          <Trans>Vezi instruirile</Trans>
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {trainingDomains.map((domain) => (
          <DomainCard key={domain} domain={domain} records={records} sheetAccess={sheetAccess} />
        ))}
      </div>
    </section>
  );
}

function DomainCard({
  domain,
  records,
  sheetAccess,
}: {
  domain: TrainingDomain;
  records: PortalTrainingRecordsResponse;
  sheetAccess: SheetAccess;
}) {
  const { t, i18n } = useLingui();
  const formatDate = useFormatDate();
  const label = i18n._(trainingDomainMessages[domain]);
  const status = records.training[domain];
  const last = records.items.find((record) => record.domain === domain);
  const sheetReady = sheetAccess.sheets?.[domain].ready === true;

  return (
    <article
      data-testid={`training-summary-${domain}`}
      className={`${cardClass} grid content-start gap-3 px-4 py-4 sm:gap-3.5 sm:px-5`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold sm:text-base">{t`Instruire ${label}`}</h3>
        {status.state && (
          <TrainingStateBadge state={status.state} testId={`training-state-${domain}`} />
        )}
      </div>
      {last ? (
        <>
          <dl className="grid grid-cols-2 gap-3">
            <div className="grid content-start gap-0.5">
              <dt className="text-xs text-muted-foreground sm:text-[0.8125rem]">
                <Trans>Următoarea</Trans>
              </dt>
              <dd
                data-testid={`training-due-${domain}`}
                className="text-sm font-medium tabular-nums sm:text-[0.9375rem]"
              >
                {status.dueOn ? formatDate(status.dueOn, 'short') : t`Nestabilită`}
              </dd>
            </div>
            <div className="grid content-start gap-0.5">
              <dt className="text-xs text-muted-foreground sm:text-[0.8125rem]">
                <Trans>Ultima</Trans>
              </dt>
              <dd
                data-testid={`training-last-${domain}`}
                className="text-sm font-medium tabular-nums sm:text-[0.9375rem]"
              >
                {formatDate(last.heldOn, 'short')}
              </dd>
            </div>
          </dl>
          {sheetReady && <SheetLink domain={domain} label={label} sheetAccess={sheetAccess} />}
        </>
      ) : (
        <p data-testid={`training-untrained-${domain}`} className="text-sm leading-relaxed">
          {t`Prima instruire ${label} nu a fost încă înregistrată.`}
        </p>
      )}
    </article>
  );
}

function SheetLink({
  domain,
  label,
  sheetAccess,
}: {
  domain: TrainingDomain;
  label: string;
  sheetAccess: SheetAccess;
}) {
  const { t } = useLingui();
  const { busy, failure, open } = useSheetActions(
    domain,
    sheetAccess.loadSheet,
    sheetAccess.onStale
  );
  return (
    <>
      <button
        type="button"
        data-testid={`training-summary-sheet-${domain}`}
        disabled={busy !== null}
        onClick={() => void open()}
        className="w-fit rounded-sm text-left text-sm font-medium underline underline-offset-4 hover:text-foreground/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
      >
        {busy ? t`Se pregătește fișa…` : t`Fișa individuală ${label}, PDF`}
      </button>
      {failure && <Notice variant="destructive">{failure}</Notice>}
    </>
  );
}
