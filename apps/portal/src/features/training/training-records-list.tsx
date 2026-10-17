import {
  supplementaryTrainingReasonLabels,
  trainingDomainLabels,
  trainingPhaseLabels,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { GraduationCap } from 'lucide-react';

import type { PortalTrainingRecordsResponse } from '@/api/generated/api';
import { formatDate, formatDuration, formatPerson } from '@/lib/format';

import { TrainingMaterial } from './training-material';

type TrainingRecord = PortalTrainingRecordsResponse['items'][number];

export function TrainingRecordsList({ records }: { records: TrainingRecord[] }) {
  if (records.length === 0) {
    return (
      <div
        data-testid="training-records-empty"
        className="grid justify-items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center"
      >
        <GraduationCap aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-muted-foreground">Nicio instruire înregistrată încă.</p>
      </div>
    );
  }
  return (
    <ol className="grid gap-3" data-testid="training-records">
      {records.map((record) => (
        <li
          key={record.id}
          data-testid="training-record"
          className="grid gap-2 rounded-xl border bg-card p-4 shadow-xs"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <time dateTime={record.heldOn} className="font-semibold tabular-nums">
              {formatDate(record.heldOn)}
            </time>
            <Badge variant="outline" data-testid="training-record-domain">
              {trainingDomainLabels[record.domain]}
            </Badge>
          </div>
          <p className="text-sm font-medium">
            {trainingPhaseLabels[record.phase]}
            {record.supplementaryReason && (
              <span className="font-normal text-muted-foreground">
                {' '}
                · {supplementaryTrainingReasonLabels[record.supplementaryReason]}
              </span>
            )}
          </p>
          <TrainingMaterial text={record.material} />
          <dl className="grid gap-1 text-sm">
            <div className="flex flex-wrap gap-x-1">
              <dt className="text-muted-foreground">Instructor:</dt>
              <dd>{formatPerson(record.trainer)}</dd>
            </div>
            <div className="flex flex-wrap gap-x-1">
              <dt className="text-muted-foreground">Durata:</dt>
              <dd className="tabular-nums">{formatDuration(record.durationMinutes)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
