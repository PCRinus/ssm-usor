import './source-pdf-view.css';

import { Button } from '@ssm-usor/ui/components/button';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  PDFWorker,
  type RenderTask,
  TextLayer,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { ImportSourceResponse } from '@/api/generated/api';

import { markQuote, pageQuotes } from './source-match';
import { ZoomBar } from './zoom-bar';

GlobalWorkerOptions.workerSrc = workerUrl;

// Starting a worker takes about half a second, so one serves every PDF opened; a loading task
// handed a worker leaves it running when it is destroyed.
let worker: PDFWorker | null = null;
const sharedWorker = () => {
  if (!worker || worker.destroyed) worker = new PDFWorker();
  return worker;
};

const openingPage = (source: ImportSourceResponse) => source.page ?? source.match?.page ?? 1;

// Each answer carries a link signed anew, so the PDF is held by its file: stepping to another
// passage in it only turns to its page and moves the mark.
export default function PdfSourceView({
  source,
  quote,
  onNotFound,
  onShown,
  onProgress,
}: {
  source: ImportSourceResponse;
  quote: string | null;
  onNotFound: () => void;
  onShown: () => void;
  onProgress?: (loaded: number, total: number) => void;
}) {
  const url = source.original.url;
  const { fileId } = source;
  const [loaded, setLoaded] = useState<{ fileId: string; pdf: PDFDocumentProxy } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const pdf = loaded?.fileId === fileId ? loaded.pdf : null;
  const held = pdf !== null;
  const failed = failedUrl === url;
  const [opened, setOpened] = useState(source);
  const [pageNumber, setPageNumber] = useState(openingPage(source));
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const reported = useRef<ImportSourceResponse | null>(null);
  const reportNotFound = useEffectEvent(() => onNotFound());
  const reportShown = useEffectEvent(() => onShown());
  const reportProgress = useEffectEvent((loaded: number, total: number) =>
    onProgress?.(loaded, total)
  );
  if (opened !== source) {
    setOpened(source);
    setPageNumber(openingPage(source));
  }

  // Destroying the task rejects its promise, which is no failure: React's development mode
  // mounts twice, and a new link replaces the old one.
  useEffect(() => {
    if (held) return;
    let cancelled = false;
    let kept = false;
    const task = getDocument({ url, worker: sharedWorker() });
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (!cancelled) reportProgress(loaded, total);
    };
    task.promise.then(
      (document) => {
        if (cancelled) return;
        kept = true;
        setLoaded({ fileId, pdf: document });
      },
      () => {
        if (!cancelled) setFailedUrl(url);
      }
    );
    return () => {
      cancelled = true;
      if (!kept) void task.destroy();
    };
  }, [url, fileId, held]);

  useEffect(() => {
    if (!loaded) return;
    return () => void loaded.pdf.loadingTask.destroy();
  }, [loaded]);

  useEffect(() => {
    if (!pdf || !canvas.current || !textLayer.current || !page.current || !scroller.current) {
      return;
    }
    let cancelled = false;
    let rendering: RenderTask | null = null;
    let text: TextLayer | null = null;
    const layer = textLayer.current;
    const target = page.current;
    const room = scroller.current.clientWidth - 32;
    void pdf
      .getPage(pageNumber)
      .then(async (pdfPage) => {
        if (cancelled) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        const scale = zoom === 'fit' ? Math.max(0.5, Math.min(2, room / natural.width)) : zoom;
        const viewport = pdfPage.getViewport({ scale });
        const ratio = window.devicePixelRatio || 1;
        const element = canvas.current!;
        element.width = Math.floor(viewport.width * ratio);
        element.height = Math.floor(viewport.height * ratio);
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        target.style.setProperty('--total-scale-factor', String(scale));
        // A canvas takes one render at a time, so the one this effect replaces is cancelled first.
        rendering = pdfPage.render({
          canvas: element,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        await rendering.promise;
        if (!cancelled) reportShown();
        layer.replaceChildren();
        if (cancelled || !quote) return;
        text = new TextLayer({
          textContentSource: pdfPage.streamTextContent(),
          container: layer,
          viewport,
        });
        await text.render();
        if (cancelled) return;
        const spans = text.textDivs;
        const marked = pageQuotes(source, pageNumber, quote).flatMap((part) =>
          markQuote(spans, part.quote, part.occurrence)
        );
        if (marked.length > 0) marked[0]!.scrollIntoView({ block: 'center' });
        else if (reported.current !== source && pageNumber === openingPage(source)) {
          reported.current = source;
          reportNotFound();
        }
      })
      .catch(() => {
        if (!cancelled) setFailedUrl(url);
      });
    return () => {
      cancelled = true;
      rendering?.cancel();
      text?.cancel();
    };
  }, [pdf, url, pageNumber, zoom, quote, source]);

  useEffect(() => {
    if (failed) reportShown();
  }, [failed]);

  if (failed) {
    return (
      <p className="p-6 text-sm text-destructive" role="alert">
        PDF-ul nu a putut fi deschis aici. Descarcă originalul ca să-l vezi.
      </p>
    );
  }
  return (
    <>
      <div ref={scroller} className="h-full overflow-auto p-4" data-testid="source-pdf">
        <div ref={page} className="import-pdf-page relative mx-auto bg-white shadow-sm">
          <canvas ref={canvas} className="block" />
          <div ref={textLayer} className="textLayer" />
        </div>
      </div>
      {pdf && (
        <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs shadow-sm">
          <Button
            variant="ghost"
            size="xs"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber(pageNumber - 1)}
            aria-label="Pagina anterioară"
          >
            ‹
          </Button>
          <span className="tabular-nums">
            Pagina {pageNumber} din {pdf.numPages}
          </span>
          <Button
            variant="ghost"
            size="xs"
            disabled={pageNumber >= pdf.numPages}
            onClick={() => setPageNumber(pageNumber + 1)}
            aria-label="Pagina următoare"
          >
            ›
          </Button>
        </div>
      )}
      <ZoomBar zoom={zoom} onZoom={setZoom} fit />
    </>
  );
}
