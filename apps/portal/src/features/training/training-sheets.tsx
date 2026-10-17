import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { type TrainingDomain, trainingDomains } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { FileDown, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import type {
  PortalTrainingRecordsResponse,
  PortalTrainingSheetsResponse,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { cardClass, SectionLabel } from '@/components/page';
import { useFormatDate } from '@/lib/format';
import { trainingDomainMessages } from '@/lib/labels';

import { useMissingSheetDataSentence } from './missing-sheet-data';
import { type LoadSheet, useSheetActions } from './use-sheet-actions';

type TrainingRecord = PortalTrainingRecordsResponse['items'][number];

type TrainingSheetsProps = {
  title: ReactNode;
  sheets: PortalTrainingSheetsResponse | undefined;
  // Undefined while the records load, so a sheet is not called empty before they arrive; null
  // when they failed, and the sheets then go by their readiness alone.
  records: TrainingRecord[] | null | undefined;
  failed: boolean;
  loadSheet: LoadSheet;
  onStale: () => void;
  className?: string;
};

export function TrainingSheets({
  title,
  sheets,
  records,
  failed,
  loadSheet,
  onStale,
  className,
}: TrainingSheetsProps) {
  return (
    <section
      aria-labelledby="training-sheets-title"
      data-testid="training-sheets"
      className={cn('grid gap-2.5 lg:gap-3.5', className)}
    >
      <SectionLabel id="training-sheets-title">{title}</SectionLabel>
      {failed ? (
        <Notice variant="destructive" data-testid="training-sheets-error">
          <Trans>Nu am putut verifica fișele. Reîncarcă pagina.</Trans>
        </Notice>
      ) : (
        trainingDomains.map((domain) => (
          <TrainingSheetCard
            key={domain}
            domain={domain}
            sheet={sheets?.[domain]}
            records={records && records.filter((record) => record.domain === domain)}
            loadSheet={loadSheet}
            onStale={onStale}
          />
        ))
      )}
    </section>
  );
}

function TrainingSheetCard({
  domain,
  sheet,
  records,
  loadSheet,
  onStale,
}: {
  domain: TrainingDomain;
  sheet: PortalTrainingSheetsResponse[TrainingDomain] | undefined;
  records: TrainingRecord[] | null | undefined;
  loadSheet: LoadSheet;
  onStale: () => void;
}) {
  const { t, i18n } = useLingui();
  const formatDate = useFormatDate();
  const missingSentence = useMissingSheetDataSentence();
  const { busy, failure, open, download } = useSheetActions(domain, loadSheet, onStale);
  const label = i18n._(trainingDomainMessages[domain]);
  const untrained = records?.length === 0;
  const openable = sheet?.ready === true && records !== undefined && !untrained;
  const latest = records?.[0];
  // Kept on one line: a date split across two reads as two separate facts.
  const updated = latest && formatDate(latest.heldOn, 'short').replaceAll(' ', '\u00a0');
  const count = records?.length ?? 0;

  return (
    <article
      data-testid={`training-sheet-${domain}`}
      className={cn(
        cardClass,
        'grid gap-3 px-4 py-3.5 lg:px-5 lg:py-4.5',
        openable && 'grid-cols-[minmax(0,1fr)_auto] items-center lg:grid-cols-1'
      )}
    >
      <div className="grid min-w-0 gap-0.5">
        <h3 className="text-[0.9375rem] font-semibold">
          <span className="lg:hidden">{t`Fișa ${label}`}</span>
          <span className="hidden lg:inline">{t`Fișa individuală ${label}`}</span>
        </h3>
        {openable && updated && (
          <p className="text-xs text-muted-foreground lg:text-[0.8125rem]">
            {t({
              message: plural(count, {
                one: `# instruire, actualizată ${updated}`,
                few: `# instruiri, actualizată ${updated}`,
                other: `# de instruiri, actualizată ${updated}`,
              }),
            })}
          </p>
        )}
      </div>
      {!sheet || records === undefined ? (
        <p role="status" className="text-sm text-muted-foreground">
          <Trans>Se verifică…</Trans>
        </p>
      ) : openable ? (
        <div className="flex gap-2">
          <Button
            data-testid={`training-sheet-${domain}-open`}
            className="h-10 flex-1 px-3.5 whitespace-nowrap"
            disabled={busy !== null}
            onClick={() => void open()}
          >
            {busy === 'open' && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            <Trans>Deschide PDF</Trans>
          </Button>
          <Button
            variant="outline"
            data-testid={`training-sheet-${domain}-download`}
            className="size-10 lg:h-10 lg:w-auto lg:flex-1"
            aria-label={t`Descarcă fișa ${label}`}
            disabled={busy !== null}
            onClick={() => void download()}
          >
            {busy === 'download' ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <FileDown aria-hidden="true" className="lg:hidden" />
            )}
            <span aria-hidden="true" className="hidden lg:inline">
              <Trans>Descarcă</Trans>
            </span>
          </Button>
        </div>
      ) : (
        <div className="grid gap-1 text-sm leading-relaxed text-foreground/80">
          {untrained && (
            <p data-testid={`training-sheet-${domain}-untrained`}>
              {t`Se întocmește după prima instruire ${label}.`}
            </p>
          )}
          {!sheet.ready && (
            <p data-testid={`training-sheet-${domain}-missing`}>{missingSentence(sheet.missing)}</p>
          )}
        </div>
      )}
      {failure && (
        <Notice
          variant="destructive"
          data-testid={`training-sheet-${domain}-error`}
          className="col-span-full"
        >
          {failure}
        </Notice>
      )}
    </article>
  );
}
