import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Copy, Download, FileText, ScanText } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import {
  getGetImportSourceQueryKey,
  getImportSource,
  type ImportSourceResponse,
  useGetImportSource,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';

import { endSentence, filesLabel, importErrorMessage } from './import-format';
import type { LabelledSource } from './review-model';
import { type SourceKind, sourceKind } from './source-match';
import { ZoomBar } from './zoom-bar';

const WordSourceView = lazy(() => import('./source-word-view'));
const PdfSourceView = lazy(() => import('./source-pdf-view'));

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
  const params = { file: current.file, quote: current.quote.slice(0, 2000) };
  const query = useGetImportSource(importId, params, {
    request: apiRequest,
    query: {
      queryKey: getGetImportSourceQueryKey(importId, params),
      staleTime: 4 * 60_000,
      gcTime: 4 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });
  const source = query.data;
  const kind = source ? sourceKind(source) : null;
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
              {source?.fileName ?? current.file.split('/').at(-1)}
            </span>
            {kind && (
              <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                {kindLabels[kind]}
              </span>
            )}
            {source?.page && (
              <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground tabular-nums">
                Pagina {source.page}
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
      >
        {query.isPending && (
          <p className="p-6 text-sm text-muted-foreground" role="status">
            Se deschide fișierul…
          </p>
        )}
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
        {source && (
          <Suspense
            fallback={
              <p className="p-6 text-sm text-muted-foreground" role="status">
                Se deschide fișierul…
              </p>
            }
          >
            {kind === 'word' && (
              <WordSourceView
                key={index}
                source={source}
                quote={current.quote}
                onNotFound={() =>
                  setNotFound(
                    source.match ? unplaced : 'Nu am găsit pasajul în document, așa că nu e marcat.'
                  )
                }
              />
            )}
            {(kind === 'pdf' || kind === 'scan') && (
              <PdfSourceView
                key={index}
                source={source}
                quote={kind === 'pdf' ? current.quote : null}
                onNotFound={() =>
                  setNotFound(
                    source.match ? unplaced : 'Nu am găsit pasajul pe pagină, așa că nu e marcat.'
                  )
                }
              />
            )}
            {kind === 'image' && <ImageSourceView key={index} source={source} />}
          </Suspense>
        )}
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
          {request.sources.length > 1 && `, în ${filesLabel(fileCount)}`}
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
        {source && (
          <Button
            variant="outline"
            size="sm"
            title="Fișierul așa cum a fost încărcat, fără marcaj"
            data-testid="source-download"
            disabled={downloading}
            onClick={() => void download()}
          >
            <Download aria-hidden="true" />
            Descarcă originalul
          </Button>
        )}
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

function ImageSourceView({ source }: { source: ImportSourceResponse }) {
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const url = source.derived?.url ?? source.original.url;
  return (
    <>
      <div className="h-full overflow-auto p-4" data-testid="source-image">
        <img
          src={url}
          alt={`Fotografia ${source.fileName}`}
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
