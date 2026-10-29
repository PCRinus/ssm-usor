import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  LoaderCircle,
  ScanText,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';

import { getImportSource, type ImportSourceResponse } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';
import { PagePlaceholder } from '@/features/documents/editor-placeholder';

import { endSentence, filesLabel, importErrorMessage } from './import-format';
import type { LabelledSource } from './review-model';
import {
  requestFileName,
  requestKind,
  requestPage,
  requestPath,
  type SourceKind,
  sourceKind,
} from './source-match';
import { sourceParams, sourceQuery, useSourcePrefetch, viewerChunks } from './source-query';
import { ZoomBar } from './zoom-bar';

const WordSourceView = lazy(viewerChunks.word);
const PdfSourceView = lazy(viewerChunks.pdf);

export type SourceRequest = {
  title: string;
  sources: LabelledSource[];
  otherCompanyName?: string | null;
};

const kindLabels: Record<SourceKind, string> = {
  word: 'Document Word',
  pdf: 'PDF',
  scan: 'Scanare',
  image: 'Fotografie',
};

export function SourceDialog({
  importId,
  request,
  onClose,
}: {
  importId: string;
  request: SourceRequest | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      {request && <SourceContent importId={importId} request={request} onClose={onClose} />}
    </Dialog>
  );
}

function SourceContent({
  importId,
  request,
  onClose,
}: {
  importId: string;
  request: SourceRequest;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const [index, setIndex] = useState(0);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const current = request.sources[index]!;
  const params = sourceParams(current);
  const queryClient = useQueryClient();
  const query = useQuery(sourceQuery(importId, params, apiRequest, queryClient));
  // The answer can outlive its links: kept after the dialog closes, it can come back with links
  // Storage now refuses, so a reopened dialog waits for the new ones.
  const source = query.isStale && (query.isFetching || query.isError) ? undefined : query.data;
  // The viewer keeps the file it shows while the next passage's answer is on its way, so stepping
  // within one file neither opens it again nor blanks it.
  const [shown, setShown] = useState<{ source: ImportSourceResponse; index: number } | null>(null);
  if (source && (shown?.source !== source || shown.index !== index)) setShown({ source, index });
  const viewing =
    shown && (shown.index === index || shown.source.uploadPath === requestPath(current.file))
      ? shown
      : null;
  const viewed = viewing && request.sources[viewing.index]!;
  const viewedKind = viewing && sourceKind(viewing.source);
  const viewerKey = viewing?.source.fileId ?? null;
  const [viewer, setViewer] = useState<ViewerState>({ key: null, shown: false, progress: null });
  if (viewer.key !== viewerKey) setViewer({ key: viewerKey, shown: false, progress: null });
  const shownViewer = () =>
    setViewer((state) =>
      state.key === viewerKey && !state.shown ? { ...state, shown: true } : state
    );
  // pdf.js tells of every chunk, and each new state draws the dialog again.
  const progressOf = (loaded: number, total: number) =>
    setViewer((state) =>
      state.key === viewerKey && !state.shown && !sameProgress(state.progress, loaded, total)
        ? { ...state, progress: { loaded, total } }
        : state
    );
  const opening = !query.isError && !(viewer.key === viewerKey && viewer.shown);
  const switching = viewing !== null && viewing.index !== index && !query.isError;
  const settled = viewing?.index === index && !opening && !query.isError;
  const prefetch = useSourcePrefetch(importId);
  useEffect(() => {
    if (!settled) return;
    for (const neighbour of [request.sources[index - 1], request.sources[index + 1]]) {
      if (neighbour) prefetch(neighbour);
    }
  }, [settled, index, request.sources, prefetch]);
  const kind = source ? sourceKind(source) : requestKind(current.file);
  const page = source ? source.page : requestPage(current.file);
  const fileCount = new Set(request.sources.map((each) => each.file)).size;
  const step = (next: number) => {
    setNotFound(null);
    setDownloadError(null);
    setIndex(next);
  };

  // The links last five minutes, so the one the viewer opened may be gone by the time of a
  // download.
  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const fresh = await getImportSource(importId, params, apiRequest);
      const anchor = document.createElement('a');
      anchor.href = downloadLink(fresh.original.url, fresh.fileName);
      anchor.click();
    } catch (cause) {
      setDownloadError(
        importErrorMessage(cause, 'Nu am putut descărca fișierul. Încearcă din nou.')
      );
    } finally {
      setDownloading(false);
    }
  }
  const unplaced = 'Pasajul e în acest fișier, dar nu l-am putut marca pe pagină.';
  const matchMissing =
    source && (kind === 'word' || kind === 'pdf') && source.match === null && current.quote;

  return (
    <DialogContent
      data-testid="import-source-dialog"
      showCloseButton
      className="flex h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,calc(100vw-4rem))]"
    >
      <div className="grid gap-3 border-b px-5 pt-4 pb-3 pr-12">
        <DialogTitle className="text-lg leading-snug">
          Sursa: {request.title}
          {current.label && ` — ${current.label}`}
        </DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
              {kind === 'scan' || kind === 'image' ? (
                <ScanText className="size-3.5" aria-hidden="true" />
              ) : (
                <FileText className="size-3.5" aria-hidden="true" />
              )}
              {source?.fileName ?? requestFileName(current.file)}
            </span>
            {kind && (
              <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                {kindLabels[kind]}
              </span>
            )}
            {page !== null && (
              <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground tabular-nums">
                Pagina {page}
              </span>
            )}
          </div>
        </DialogDescription>
        {request.otherCompanyName && (
          <Notice
            variant="warning"
            icon={<Copy aria-hidden="true" />}
            data-testid="source-other-company"
          >
            Pasajul numește altă firmă,{' '}
            <strong className="font-semibold">{endSentence(request.otherCompanyName)}</strong> Pare
            copiat din dosarul ei, așa că valoarea nu e bifată.
          </Notice>
        )}
        {(kind === 'scan' || kind === 'image') && current.quote && (
          <dl
            className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]"
            data-testid="source-read"
          >
            <dt className="text-muted-foreground">Am citit</dt>
            <dd>
              <q>{current.quote}</q>
            </dd>
            <dt className="text-muted-foreground">Pe imagine</dt>
            <dd className="text-muted-foreground">
              Pasajul nu e marcat: citirea unei scanări nu spune unde se află textul pe pagină.
            </dd>
          </dl>
        )}
        {downloadError && (
          <Notice variant="destructive" data-testid="source-download-error">
            {downloadError}
          </Notice>
        )}
        {(matchMissing || notFound) && (
          <Notice variant="warning" data-testid="source-not-found">
            {notFound ?? 'Nu am găsit pasajul în fișier, așa că nu e marcat.'} Am citit:{' '}
            <q>{current.quote}</q>
          </Notice>
        )}
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-muted/60"
        data-testid="source-viewer"
        aria-busy={opening || switching}
      >
        {query.isError && (
          <div className="p-6">
            <Notice variant="destructive" data-testid="source-error">
              {query.error instanceof ApiHttpError && query.error.status === 404
                ? 'Fișierul nu mai este în import.'
                : importErrorMessage(
                    query.error,
                    'Nu am putut deschide fișierul. Încearcă din nou.'
                  )}
            </Notice>
          </div>
        )}
        {viewing && viewed && !query.isError && (
          <div
            className={cn(
              'h-full transition-opacity motion-reduce:transition-none',
              switching && !opening && 'opacity-50'
            )}
            inert={opening}
          >
            <Suspense fallback={null}>
              {viewedKind === 'word' && (
                <WordSourceView
                  key={viewing.source.fileId}
                  source={viewing.source}
                  quote={viewed.quote}
                  onShown={shownViewer}
                  onNotFound={() =>
                    setNotFound(
                      viewing.source.match
                        ? unplaced
                        : 'Nu am găsit pasajul în document, așa că nu e marcat.'
                    )
                  }
                />
              )}
              {(viewedKind === 'pdf' || viewedKind === 'scan') && (
                <PdfSourceView
                  key={viewing.source.fileId}
                  source={viewing.source}
                  quote={viewedKind === 'pdf' ? viewed.quote : null}
                  onShown={shownViewer}
                  onProgress={progressOf}
                  onNotFound={() =>
                    setNotFound(
                      viewing.source.match
                        ? unplaced
                        : 'Nu am găsit pasajul pe pagină, așa că nu e marcat.'
                    )
                  }
                />
              )}
              {viewedKind === 'image' && (
                <ImageSourceView
                  key={viewing.source.fileId}
                  source={viewing.source}
                  onShown={shownViewer}
                />
              )}
            </Suspense>
          </div>
        )}
        {switching && !opening && (
          <div
            role="status"
            className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs shadow-sm"
            data-testid="source-switching"
          >
            <LoaderCircle
              className="size-3.5 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
            Se deschide pasajul…
          </div>
        )}
        {opening && <SourcePlaceholder kind={kind} progress={viewer.progress} />}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
        <Button
          variant="outline"
          size="sm"
          data-testid="source-previous"
          disabled={index === 0}
          onClick={() => step(index - 1)}
        >
          <ChevronLeft aria-hidden="true" />
          Pasajul anterior
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums" data-testid="source-position">
          {index + 1} din {request.sources.length}
          {request.sources.length > 1 &&
            (fileCount === 1 ? ', într-un fișier' : `, în ${filesLabel(fileCount)}`)}
        </span>
        <Button
          variant="outline"
          size="sm"
          data-testid="source-next"
          disabled={index >= request.sources.length - 1}
          onClick={() => step(index + 1)}
        >
          Pasajul următor
          <ChevronRight aria-hidden="true" />
        </Button>
        <span className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          title="Fișierul așa cum a fost încărcat, fără marcaj"
          data-testid="source-download"
          disabled={!source || downloading}
          onClick={() => void download()}
        >
          <Download aria-hidden="true" />
          Descarcă originalul
        </Button>
        <Button size="sm" onClick={onClose}>
          Închide
        </Button>
      </div>
    </DialogContent>
  );
}

// A Storage link names the file to save through `download`; the attribute of an anchor is
// ignored for another origin.
const downloadLink = (url: string, fileName: string) =>
  `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(fileName)}`;

type ViewerState = {
  key: string | null;
  shown: boolean;
  progress: { loaded: number; total: number } | null;
};

const openingLabels: Record<SourceKind, string> = {
  word: 'Se deschide documentul…',
  pdf: 'Se deschide documentul…',
  scan: 'Se deschide scanarea…',
  image: 'Se deschide fotografia…',
};

const progressAfterMs = 800;
const megabytes = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const inMegabytes = (bytes: number) => megabytes.format(bytes / 1024 / 1024);
const sameProgress = (shown: ViewerState['progress'], loaded: number, total: number) =>
  shown !== null && shown.total === total && inMegabytes(shown.loaded) === inMegabytes(loaded);

// One placeholder from the click until the file is drawn, over the answer, the viewer's code and
// the file itself, so the dialog does not change three times while it opens.
function SourcePlaceholder({
  kind,
  progress,
}: {
  kind: SourceKind | null;
  progress: ViewerState['progress'];
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), progressAfterMs);
    return () => clearTimeout(timer);
  }, []);
  const share =
    progress && progress.total > 0 ? Math.min(1, progress.loaded / progress.total) : null;
  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden bg-background"
      data-testid="source-loading"
    >
      <PagePlaceholder
        className="h-full bg-muted/60"
        detail={
          slow &&
          progress &&
          share !== null && (
            <div className="grid gap-1.5" data-testid="source-progress">
              <div
                role="progressbar"
                aria-label="Fișier descărcat"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(share * 100)}
                className="h-1 w-full min-w-48 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                  style={{ width: `${share * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {inMegabytes(progress.loaded)} din {inMegabytes(progress.total)} MB
              </span>
            </div>
          )
        }
      >
        {openingLabels[kind ?? 'pdf']}
      </PagePlaceholder>
    </div>
  );
}

function ImageSourceView({
  source,
  onShown,
}: {
  source: ImportSourceResponse;
  onShown: () => void;
}) {
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const latest = source.derived?.url ?? source.original.url;
  // Each answer carries a link signed anew, so the photo is held by its first link unless that
  // one failed.
  const [url, setUrl] = useState(latest);
  const [failed, setFailed] = useState(false);
  if (failed && latest !== url) {
    setUrl(latest);
    setFailed(false);
  }
  return (
    <>
      <div className="h-full overflow-auto p-4" data-testid="source-image">
        <img
          src={url}
          alt={`Fotografia ${source.fileName}`}
          onLoad={onShown}
          onError={() => {
            setFailed(true);
            onShown();
          }}
          className={cn(
            'mx-auto block bg-card shadow-sm',
            zoom === 'fit' && 'max-h-full max-w-full object-contain'
          )}
          style={zoom === 'fit' ? undefined : { width: `${zoom * 100}%`, maxWidth: 'none' }}
        />
      </div>
      <ZoomBar zoom={zoom} onZoom={setZoom} fit />
    </>
  );
}
