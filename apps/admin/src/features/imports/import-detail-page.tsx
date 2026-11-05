import type {
  AdminImportCopy,
  AdminImportCopyFile,
  AdminImportDetail,
  AdminImportPart,
  ImportStatus,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useRouteContext } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

import { ApiHttpError } from '@/api/http';
import { AdminShell, LoadFailure } from '@/components/admin-shell';
import { ErrorNotice } from '@/components/error-notice';

import { fetchFileLink, fetchImport } from './api';
import {
  formatBytes,
  formatCost,
  formatDateTime,
  formatShare,
  incompleteCopyExplanation,
  incompleteCopyOfDeletedRow,
  kindLabels,
  partLabels,
} from './format';
import { IncompleteCopyBadge } from './incomplete-copy-badge';
import { JsonTree } from './json-tree';
import { QualityList, ReadingFlagsList, ReadingVersion } from './reading';
import { StatusBadge } from './status-badge';

type CopyRecord = Record<string, unknown> & {
  kind?: string;
  status?: string;
  failureReason?: string | null;
  times?: Record<string, string | null>;
  proposal?: unknown;
  changes?: unknown;
  readingFlags?: unknown;
  quality?: unknown;
  readingVersion?: unknown;
  usage?: { costUsd?: number };
};

const recordOf = (value: unknown): CopyRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as CopyRecord) : null;

function Section({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId} className="bg-background rounded-xl border p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{term}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function ProposalAndChanges({ record, testId }: { record: CopyRecord | null; testId?: string }) {
  if (!record) return <p className="text-muted-foreground text-sm">The copy has no record.</p>;
  return (
    <div data-testid={testId} className="grid gap-4 lg:grid-cols-2">
      <div className="min-w-0 rounded-lg border p-3">
        <h3 className="mb-2 text-sm font-medium">Proposal</h3>
        {record.proposal == null ? (
          <p className="text-muted-foreground text-sm">None kept.</p>
        ) : (
          <JsonTree value={record.proposal} openDepth={2} testId="copy-proposal" />
        )}
      </div>
      <div className="min-w-0 rounded-lg border p-3">
        <h3 className="mb-2 text-sm font-medium">The member’s changes</h3>
        {record.changes == null ? (
          <p className="text-muted-foreground text-sm">No changes saved.</p>
        ) : (
          <JsonTree value={record.changes} openDepth={2} testId="copy-changes" />
        )}
      </div>
    </div>
  );
}

function RestOfRecord({ record }: { record: CopyRecord | null }) {
  if (!record) return null;
  const rest = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'proposal' && key !== 'changes')
  );
  return (
    <details className="mt-3 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        The rest of the record: files, times, counts, usage
      </summary>
      <JsonTree value={rest} openDepth={1} className="mt-2" />
    </details>
  );
}

function CopyRows({ copies, rowDeleted }: { copies: AdminImportCopy[]; rowDeleted: boolean }) {
  return (
    <ul className="divide-y text-sm">
      {copies.map((copy) => {
        const incomplete = !copy.removedAt && !copy.completedAt;
        return (
          <li
            key={copy.id}
            data-testid="copy-row"
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-1.5"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {copy.part ? partLabels[copy.part] : 'The import'}
              </span>
              {incomplete && <IncompleteCopyBadge />}
            </span>
            <span className="text-muted-foreground">
              written {formatDateTime(copy.writtenAt)} ·{' '}
              {copy.removedAt
                ? `removed ${formatDateTime(copy.removedAt)}`
                : `kept until ${formatDateTime(copy.expiresAt)}`}
            </span>
            {incomplete && (
              <span className="text-muted-foreground basis-full text-xs">
                {rowDeleted ? incompleteCopyOfDeletedRow : incompleteCopyExplanation}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CopyFiles({ importId, files }: { importId: string; files: AdminImportCopyFile[] }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const opening = useMutation({
    mutationFn: async (path: string) => {
      // Opened before the request, while the click still counts as the admin's gesture, or the
      // browser blocks the tab.
      const tab = window.open('', '_blank');
      try {
        const link = await fetchFileLink(importId, path, apiRequest);
        if (tab) {
          tab.opener = null;
          tab.location.href = link.url;
        } else {
          window.location.assign(link.url);
        }
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
  });

  if (files.length === 0) {
    return <p className="text-muted-foreground text-sm">The copy holds no file.</p>;
  }
  return (
    <>
      {opening.isError && (
        <div className="mb-3">
          <ErrorNotice testId="file-link-error">
            The file could not be opened. Try again.
          </ErrorNotice>
        </div>
      )}
      <Table data-testid="copy-files" aria-label="Files of the copy">
        <TableHeader>
          <TableRow>
            <TableHead>Path</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead>
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => (
            <TableRow key={file.path} data-testid="copy-file">
              <TableCell className="font-mono text-xs whitespace-normal [overflow-wrap:anywhere]">
                {file.path}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBytes(file.sizeBytes)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={opening.isPending && opening.variables === file.path}
                  onClick={() => opening.mutate(file.path)}
                >
                  <ExternalLink aria-hidden="true" />
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

function PartCard({ part, record }: { part: AdminImportPart; record: CopyRecord | null }) {
  return (
    <article data-testid="import-part" className="rounded-lg border p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{partLabels[part.part]}</h3>
        <Badge variant={part.status === 'failed' ? 'destructive' : 'outline'}>{part.status}</Badge>
        {part.reportedAt && <Badge variant="destructive">Reported</Badge>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact term="Read">{formatDateTime(part.readAt)}</Fact>
        <Fact term="Confirmed">{formatDateTime(part.confirmedAt)}</Fact>
        <Fact term="Failed">{formatDateTime(part.failedAt)}</Fact>
        <Fact term="Attempt">{part.attempt}</Fact>
        <Fact term="Cost">{formatCost(part.costUsd)}</Fact>
        <Fact term="Changed">{formatShare(part.changedShare)}</Fact>
        <Fact term="Version">
          <ReadingVersion value={part.readingVersion} />
        </Fact>
        {part.reportedAt && (
          <Fact term="Reported">
            {formatDateTime(part.reportedAt)}
            {part.reportedBy && (
              <span className="text-muted-foreground block font-mono text-xs">
                {part.reportedBy}
              </span>
            )}
          </Fact>
        )}
      </dl>
      {part.failureReason && (
        <p className="text-destructive mt-3 text-sm">Failure: {part.failureReason}</p>
      )}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-medium">Flags</h4>
          <ReadingFlagsList value={part.readingFlags} />
        </div>
        <div>
          <h4 className="text-sm font-medium">Quality</h4>
          <QualityList value={part.quality} share={part.changedShare} />
        </div>
      </div>
      {record && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">
            The part’s copy: proposal and changes
          </summary>
          <div className="mt-2">
            <ProposalAndChanges record={record} />
            <RestOfRecord record={record} />
          </div>
        </details>
      )}
    </article>
  );
}

function DetailBody({ detail }: { detail: AdminImportDetail }) {
  const row = detail.import;
  const record = recordOf(detail.record);
  const times = record?.times ?? {};
  const kind = row?.kind ?? (record?.kind as keyof typeof kindLabels | undefined);
  const status = row?.status ?? (record?.status as ImportStatus | undefined) ?? null;
  const ended = row
    ? (row.confirmedAt ?? row.abandonedAt ?? row.failedAt)
    : (times.confirmedAt ?? times.abandonedAt ?? times.failedAt ?? null);
  const kept = detail.copies.filter((copy) => !copy.removedAt);
  const reports = [
    ...(row?.reportedAt ? [{ who: 'The import', at: row.reportedAt, by: row.reportedBy }] : []),
    ...detail.parts
      .filter((part) => part.reportedAt)
      .map((part) => ({ who: partLabels[part.part], at: part.reportedAt!, by: part.reportedBy })),
  ];

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/imports"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Imports
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 data-testid="import-title" className="text-2xl font-semibold tracking-tight">
            {kind ? `${kindLabels[kind]} import` : 'Import'}
          </h1>
          <StatusBadge status={status} rowDeleted={!row && !status} />
          {!row && <Badge variant="outline">Row deleted</Badge>}
          {reports.length > 0 && <Badge variant="destructive">Reported</Badge>}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {detail.organization.name ?? 'Unknown organization'} ·{' '}
          <span className="font-mono text-xs break-all">{detail.id}</span>
        </p>
      </div>

      {!row && (
        <ErrorNotice testId="row-deleted">
          The clean-up deleted this import’s row. What follows is what its copy holds.
        </ErrorNotice>
      )}

      <Section title="Overview" testId="import-overview">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Fact term="Organization">
            {detail.organization.name ?? '—'}
            <span className="text-muted-foreground block font-mono text-xs break-all">
              {detail.organization.id}
            </span>
          </Fact>
          <Fact term="Created">{formatDateTime(row?.createdAt ?? null)}</Fact>
          <Fact term="Started">{formatDateTime(row?.startedAt ?? times.startedAt ?? null)}</Fact>
          <Fact term="Read">{formatDateTime(row?.readyAt ?? times.readyAt ?? null)}</Fact>
          <Fact term="Ended">{formatDateTime(ended)}</Fact>
          <Fact term="Cost">{formatCost(row?.costUsd ?? record?.usage?.costUsd ?? null)}</Fact>
          {row && (
            <Fact term="Tokens">
              {row.inputTokens.toLocaleString('en-GB')} in (
              {row.cachedInputTokens.toLocaleString('en-GB')} cached) ·{' '}
              {row.outputTokens.toLocaleString('en-GB')} out
            </Fact>
          )}
          <Fact term="Reading version">
            <ReadingVersion value={row?.readingVersion ?? record?.readingVersion} />
          </Fact>
        </dl>
        {(row?.failureReason ?? record?.failureReason) && (
          <p className="text-destructive mt-4 text-sm">
            Failure: {row?.failureReason ?? record?.failureReason}
          </p>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Flags" description="Counts that describe the reading, never what it read.">
          <ReadingFlagsList
            value={row?.readingFlags ?? record?.readingFlags}
            testId="import-flags"
          />
        </Section>
        <Section title="Quality" description="What the member did with the proposal.">
          <QualityList value={row?.quality ?? record?.quality} share={row?.changedShare ?? null} />
        </Section>
      </div>

      <Section title="Reports" testId="import-reports">
        {reports.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nobody reported a problem.</p>
        ) : (
          <ul className="divide-y text-sm">
            {reports.map((report) => (
              <li key={report.who} className="flex flex-wrap justify-between gap-x-4 py-1.5">
                <span className="font-medium">{report.who}</span>
                <span className="text-muted-foreground">
                  {formatDateTime(report.at)}
                  {report.by && <span className="ml-2 font-mono text-xs">by {report.by}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {detail.parts.length > 0 && (
        <Section title="Library parts" testId="import-parts">
          <div className="space-y-3">
            {detail.parts.map((part) => (
              <PartCard
                key={part.part}
                part={part}
                record={recordOf(
                  detail.partRecords.find((each) => each.part === part.part)?.record
                )}
              />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Improvement copy"
        testId="import-copy"
        description={
          kept.length > 0
            ? 'Kept 12 months to improve the reading. Opening it and each file is in the audit log.'
            : 'Written when the import or a part ends.'
        }
      >
        {detail.copies.length === 0 ? (
          <p data-testid="no-copy" className="text-muted-foreground text-sm">
            No copy written yet.
          </p>
        ) : (
          <>
            <CopyRows copies={detail.copies} rowDeleted={!detail.import} />
            {kept.length > 0 && (
              <div className="mt-4 space-y-4">
                {record && <ProposalAndChanges record={record} testId="copy-side-by-side" />}
                <RestOfRecord record={record} />
                {!row &&
                  detail.partRecords.map((part) => (
                    <details key={part.part} className="rounded-lg border p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        {partLabels[part.part]}: the part’s copy
                      </summary>
                      <div className="mt-2">
                        <ProposalAndChanges record={recordOf(part.record)} />
                      </div>
                    </details>
                  ))}
                <div>
                  <h3 className="mb-2 text-sm font-medium">Files</h3>
                  <CopyFiles importId={detail.id} files={detail.files} />
                </div>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

export function ImportDetailPage({ id }: { id: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  // Every load of a page with a copy writes an audit event, so it loads once and is not
  // refetched behind the admin's back.
  const detail = useQuery({
    queryKey: ['admin', 'import', id],
    queryFn: ({ signal }) => fetchImport(id, { ...apiRequest, signal }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  return (
    <AdminShell testId="import-detail-page" wide>
      {detail.isPending ? (
        <div role="status" aria-label="Loading" className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : detail.isError ? (
        detail.error instanceof ApiHttpError && detail.error.status === 404 ? (
          <div data-testid="import-not-found" className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">No such import</h1>
            <p className="text-muted-foreground text-sm">
              Neither its row nor a copy of it is kept.
            </p>
            <Link to="/imports" className="text-sm font-medium underline underline-offset-4">
              Back to the imports
            </Link>
          </div>
        ) : (
          <LoadFailure error={detail.error} onRetry={() => void detail.refetch()} />
        )
      ) : (
        <DetailBody detail={detail.data} />
      )}
    </AdminShell>
  );
}
