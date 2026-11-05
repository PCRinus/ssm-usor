import type { ReactNode } from 'react';

import { formatShare } from './format';

interface Place {
  file: number;
  kind: string;
}

interface Flags {
  files?: {
    total?: number;
    byKind?: Record<string, number>;
    unreadable?: Place[];
    setAside?: number;
    forEmployees?: number;
    otherCompany?: number;
  };
  found?: Record<string, number>;
  emptyRequired?: string[];
  checks?: Record<string, number>;
  nothingFound?: Place[];
  proposedValues?: number;
}

type Counts = Record<string, { changed?: number; unticked?: number; kept?: number }>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const tally = (counts: Record<string, number> | undefined) =>
  Object.entries(counts ?? {})
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');

const places = (list: Place[] | undefined) =>
  (list ?? []).map((place) => `file ${place.file} (${place.kind})`).join(', ');

function Row({ term, children, alert }: { term: string; children: ReactNode; alert?: boolean }) {
  return (
    <div className="grid gap-0.5 py-1.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground text-sm">{term}</dt>
      <dd className={alert ? 'text-destructive text-sm font-medium' : 'text-sm'}>{children}</dd>
    </div>
  );
}

export function ReadingFlagsList({ value, testId }: { value: unknown; testId?: string }) {
  if (!isObject(value)) {
    return <p className="text-muted-foreground text-sm">No flags recorded.</p>;
  }
  const flags = value as Flags;
  const files = flags.files;
  const checks = tally(flags.checks);
  return (
    <dl data-testid={testId} className="divide-y">
      {files && (
        <Row term="Files">
          {files.total ?? 0}
          {tally(files.byKind) && (
            <span className="text-muted-foreground"> · {tally(files.byKind)}</span>
          )}
        </Row>
      )}
      {files?.unreadable && files.unreadable.length > 0 && (
        <Row term="Could not open" alert>
          {places(files.unreadable)}
        </Row>
      )}
      {files && (files.setAside || files.forEmployees || files.otherCompany) ? (
        <Row term="Set aside">
          {files.setAside ?? 0} set aside · {files.forEmployees ?? 0} for employees ·{' '}
          {files.otherCompany ?? 0} other company
        </Row>
      ) : null}
      <Row term="Found">{tally(flags.found) || 'Nothing'}</Row>
      {flags.proposedValues !== undefined && (
        <Row term="Values proposed">{flags.proposedValues}</Row>
      )}
      {flags.emptyRequired && flags.emptyRequired.length > 0 && (
        <Row term="Required, left empty" alert>
          {flags.emptyRequired.join(', ')}
        </Row>
      )}
      {flags.nothingFound && flags.nothingFound.length > 0 && (
        <Row term="Sorted, nothing found" alert>
          {places(flags.nothingFound)}
        </Row>
      )}
      <Row term="Check flags">{checks || 'None'}</Row>
    </dl>
  );
}

export function QualityList({ value, share }: { value: unknown; share: number | null }) {
  if (!isObject(value)) {
    return <p className="text-muted-foreground text-sm">Not confirmed: no counts yet.</p>;
  }
  return (
    <dl className="divide-y">
      <Row term="Changed or unticked">{formatShare(share)}</Row>
      {Object.entries(value as Counts).map(([section, counts]) => (
        <Row key={section} term={section}>
          {counts.changed ?? 0} changed · {counts.unticked ?? 0} unticked · {counts.kept ?? 0} kept
        </Row>
      ))}
    </dl>
  );
}

export function ReadingVersion({ value }: { value: unknown }) {
  if (!isObject(value)) return <span className="text-muted-foreground">—</span>;
  const models = isObject(value.models) ? Object.entries(value.models) : [];
  return (
    <span>
      <span className="font-mono">{String(value.prompts ?? '—')}</span>
      {models.length > 0 && (
        <span className="text-muted-foreground block text-xs">
          {models.map(([step, model]) => `${step}: ${String(model)}`).join(' · ')}
        </span>
      )}
    </span>
  );
}
