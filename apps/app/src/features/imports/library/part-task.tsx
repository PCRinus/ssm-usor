import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, LoaderCircle, LockKeyhole, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ImportDetail, ImportLibraryPartsResponse } from '@/api/generated/api';
import { TitleWithBack } from '@/components/back-link';
import { HelpLink } from '@/components/help-link';
import { LoadFailed } from '@/components/load-failed';
import { Notice } from '@/components/notice';

import { ImportOverviewBack } from '../import-back';
import { creditsLabel } from '../import-credits';
import { ReportImportButton } from '../report-import-button';
import { PartStatusTag } from './library-group';
import { libraryDay, type LibraryPost } from './library-model';
import { useLibraryParts } from './use-library-parts';

export type AnyPart = ImportLibraryPartsResponse['parts'][number];

export function PartTaskLoader<P extends AnyPart>({
  detail,
  pick,
  loadFailed,
  missing,
  children,
}: {
  detail: ImportDetail;
  pick: (parts: AnyPart[]) => P | undefined;
  loadFailed: string;
  missing: string;
  children: (part: P, posts: LibraryPost[], back: ReactNode) => ReactNode;
}) {
  const query = useLibraryParts(detail.id);
  if (query.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true" data-testid="library-task-loading">
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  const part = query.data ? pick(query.data.parts) : undefined;
  const back = (
    <Button asChild variant="outline">
      <Link
        to="/clienti/import/$importId"
        params={{ importId: detail.id }}
        data-testid="library-back-to-import"
      >
        <ArrowLeft aria-hidden="true" />
        Înapoi la propunere
      </Link>
    </Button>
  );
  return (
    <div className="grid gap-6">
      {query.isError ? (
        <LoadFailed
          error={query.error}
          testId="library-task-error"
          size="sm"
          onRetry={() => void query.refetch()}
        >
          {loadFailed}
        </LoadFailed>
      ) : !part ? (
        <Notice variant="info" data-testid="library-task-missing">
          {missing}
        </Notice>
      ) : (
        children(part, query.data?.posts ?? [], back)
      )}
      {(query.isError || !part) && <div className="justify-self-start">{back}</div>}
    </div>
  );
}

export function PartTaskHeader({
  importId,
  part,
  title,
  name,
  helpTopic,
  helpLabel,
}: {
  importId: string;
  part: AnyPart;
  title: string;
  name: string;
  helpTopic: HelpTopic;
  helpLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <TitleWithBack className="max-w-3xl" back={<ImportOverviewBack importId={importId} />}>
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <PartStatusTag part={part} />
            <HelpLink topic={helpTopic} label={helpLabel} />
          </div>
          <p className="text-sm text-muted-foreground">{name}</p>
        </div>
      </TitleWithBack>
      <div className="flex flex-wrap items-center gap-3">
        <ReportImportButton importId={importId} part={part.part} />
      </div>
    </div>
  );
}

export function PartStateNotices({
  part,
  expired,
  retrying,
  onRetry,
  texts,
}: {
  part: AnyPart;
  expired: boolean;
  retrying: boolean;
  onRetry: () => void;
  texts: {
    afterExpiry: string;
    reading: string;
    failedTitle: string;
    failedFallback: string;
    credits: number;
    untouched: string;
    confirmed: string;
    confirmedWhere: string;
    open: ReactNode;
  };
}) {
  if (expired) {
    return (
      <Notice variant="warning" data-testid="library-expired">
        Propunerea a expirat pe {libraryDay(part.expiresAt!)}, la 14 zile după crearea clientului,
        așa că nu mai poate fi confirmată. {texts.afterExpiry}
      </Notice>
    );
  }
  switch (part.status) {
    case 'reading':
      return (
        <Notice
          variant="info"
          icon={
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          }
          data-testid="library-reading"
        >
          {texts.reading} Pagina se actualizează singură când sunt gata; între timp poți verifica și
          crea clientul.
        </Notice>
      );
    case 'failed':
      return (
        <Notice
          variant="destructive"
          title={texts.failedTitle}
          data-testid="library-failed"
          action={
            <Button
              variant="outline"
              size="sm"
              className="bg-card"
              data-testid="library-retry"
              disabled={retrying}
              onClick={onRetry}
            >
              <RotateCcw aria-hidden="true" />
              {retrying ? 'Se pornește…' : 'Citește din nou'}
            </Button>
          }
        >
          <p>{part.failureReason ?? texts.failedFallback}</p>
          <p className="mt-1">
            Citirea din nou folosește {creditsLabel(texts.credits)}; dacă nu reușește, ți le
            returnăm. {texts.untouched}
          </p>
        </Notice>
      );
    case 'confirmed':
      return (
        <Notice
          variant="success"
          data-testid="library-confirmed"
          action={
            <Button asChild variant="outline" size="sm" className="bg-card">
              {texts.open}
            </Button>
          }
        >
          {texts.confirmed}
          {part.confirmedAt ? ` pe ${libraryDay(part.confirmedAt)}` : ''}. {texts.confirmedWhere}
        </Notice>
      );
    default:
      return null;
  }
}

export function ClientPrerequisiteNote({ intoExistingClient }: { intoExistingClient: boolean }) {
  return (
    <strong className="inline-flex items-start gap-1.5 font-medium text-foreground">
      <LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      {intoExistingClient ? 'Confirmă întâi completarea clientului.' : 'Creează întâi clientul.'}
    </strong>
  );
}

export function ReviewNotices({ review }: { review: { closed: string | null } }) {
  if (!review.closed) return null;
  return (
    <Notice
      variant="destructive"
      data-testid="library-review-closed"
      action={
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Reîncarcă pagina
        </Button>
      }
    >
      {review.closed}
    </Notice>
  );
}
