import { Trans, useLingui } from '@lingui/react/macro';
import { GraduationCap } from 'lucide-react';

import type { PortalTrainingRecordsResponse } from '@/api/generated/api';
import { cardClass, SectionLabel } from '@/components/page';
import { useFormatDate, useFormatDuration } from '@/lib/format';
import {
  supplementaryReasonMessages,
  trainingDomainMessages,
  trainingPhaseMessages,
} from '@/lib/labels';

import { TrainingMaterial } from './training-material';

type TrainingRecord = PortalTrainingRecordsResponse['items'][number];

function byYear(records: TrainingRecord[]) {
  const years = new Map<string, TrainingRecord[]>();
  for (const record of records) {
    const year = record.heldOn.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), record]);
  }
  return [...years];
}

export function TrainingRecordsList({ records }: { records: TrainingRecord[] }) {
  if (records.length === 0) {
    return (
      <div
        data-testid="training-records-empty"
        className="grid justify-items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center"
      >
        <GraduationCap aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-muted-foreground">
          <Trans>Nicio instruire înregistrată încă.</Trans>
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-6" data-testid="training-records">
      {byYear(records).map(([year, items]) => (
        <section key={year} aria-labelledby={`training-year-${year}`} className="grid gap-2">
          <SectionLabel id={`training-year-${year}`}>{year}</SectionLabel>
          <ol className={`${cardClass} divide-y overflow-hidden`}>
            {items.map((record) => (
              <TrainingRecordRow key={record.id} record={record} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function TrainingRecordRow({ record }: { record: TrainingRecord }) {
  const { t, i18n } = useLingui();
  const formatDate = useFormatDate();
  const formatDuration = useFormatDuration();
  const { name, jobTitle } = record.trainer;
  const duration = formatDuration(record.durationMinutes);
  const phase = i18n._(trainingPhaseMessages[record.phase]);
  const trainer = jobTitle
    ? t`Instructor ${name}, ${jobTitle}. ${duration}.`
    : t`Instructor ${name}. ${duration}.`;

  return (
    <li
      data-testid="training-record"
      className="grid gap-2 px-4 py-3.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-5 sm:px-5 sm:py-4"
    >
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-1.5">
        <time dateTime={record.heldOn} className="text-[0.9375rem] font-semibold tabular-nums">
          {formatDate(record.heldOn, 'short')}
        </time>
        <span
          data-testid="training-record-domain"
          className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
        >
          {i18n._(trainingDomainMessages[record.domain])}
        </span>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <p className="text-[0.9375rem] font-semibold">
          {record.admission ? t`${phase}, admis la lucru` : phase}
        </p>
        {record.supplementaryReason && (
          <p className="text-sm text-muted-foreground">
            {i18n._(supplementaryReasonMessages[record.supplementaryReason])}
          </p>
        )}
        <TrainingMaterial text={record.material} />
        <p className="text-[0.8125rem] text-muted-foreground">{trainer}</p>
      </div>
    </li>
  );
}
