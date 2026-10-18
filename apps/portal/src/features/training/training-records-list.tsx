import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { GraduationCap, PenLine } from 'lucide-react';

import type { PortalTrainingRecordsResponse } from '@/api/generated/api';
import { cardClass, SectionLabel } from '@/components/page';
import { slotRoleMessages } from '@/features/signing/signing-messages';
import { romanianDayOf, useFormatDate, useFormatDuration, useFormatList } from '@/lib/format';
import {
  supplementaryReasonMessages,
  trainingDomainMessages,
  trainingPhaseMessages,
} from '@/lib/labels';

import type { PendingSignature, PendingSignatures } from './pending-signatures';
import { TrainingMaterial } from './training-material';

type TrainingRecord = PortalTrainingRecordsResponse['items'][number];
type RecordSlot = TrainingRecord['slots'][number];

function byYear(records: TrainingRecord[]) {
  const years = new Map<string, TrainingRecord[]>();
  for (const record of records) {
    const year = record.heldOn.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), record]);
  }
  return [...years];
}

export function TrainingRecordsList({
  records,
  pending,
}: {
  records: TrainingRecord[];
  pending?: PendingSignatures;
}) {
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
              <TrainingRecordRow
                key={record.id}
                record={record}
                pending={pending?.get(record.id) ?? []}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function TrainingRecordRow({
  record,
  pending,
}: {
  record: TrainingRecord;
  pending: PendingSignature[];
}) {
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
        <SignedLines slots={record.slots} />
        {pending.length > 0 && <PendingLine pending={pending} />}
      </div>
    </li>
  );
}

function signedGroups(slots: RecordSlot[]) {
  const groups = new Map<string, { day: string | null; slots: RecordSlot[] }>();
  for (const slot of slots) {
    if (slot.state !== 'signed' && slot.state !== 'paper') continue;
    const day = slot.state === 'signed' && slot.signedAt ? romanianDayOf(slot.signedAt) : null;
    const key = day ?? 'paper';
    groups.set(key, { day, slots: [...(groups.get(key)?.slots ?? []), slot] });
  }
  return [...groups];
}

function SignedLines({ slots }: { slots: RecordSlot[] }) {
  const { t, i18n } = useLingui();
  const formatDate = useFormatDate();
  const formatList = useFormatList();
  const groups = signedGroups(slots);
  if (groups.length === 0) return null;
  return (
    <ul className="grid gap-0.5 text-[0.8125rem] text-muted-foreground">
      {groups.map(([key, group]) => {
        const roles = formatList(group.slots.map((slot) => i18n._(slotRoleMessages[slot.slot])));
        const day = group.day ? formatDate(group.day, 'short') : null;
        return (
          <li key={key} data-testid="training-record-signed">
            {day ? t`Semnat electronic pe ${day} (${roles}).` : t`Semnat pe hârtie (${roles}).`}
          </li>
        );
      })}
    </ul>
  );
}

function PendingLine({ pending }: { pending: PendingSignature[] }) {
  const { t, i18n } = useLingui();
  const formatList = useFormatList();
  const mine = pending.filter((each) => each.mine);
  const roles = formatList(pending.map((each) => i18n._(slotRoleMessages[each.slot])));
  const people = formatList(
    pending.map((each) => `${each.signerName} (${i18n._(slotRoleMessages[each.slot])})`)
  );
  return (
    <p
      data-testid="training-record-signatures"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-warning px-2.5 py-1.5 text-[0.8125rem] text-warning-foreground"
    >
      <PenLine aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        {mine.length > 0 ? t`Așteaptă semnătura ta (${roles}).` : t`Așteaptă semnătura: ${people}.`}
      </span>
      {mine.length > 0 && (
        <Link
          to="/semneaza"
          data-testid="training-record-sign"
          className="font-semibold underline underline-offset-4"
        >
          <Trans>Semnează</Trans>
        </Link>
      )}
    </p>
  );
}
