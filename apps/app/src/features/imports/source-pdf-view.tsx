import './source-pdf-view.css';

import { Button } from '@ssm-usor/ui/components/button';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
  TextLayer,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { ImportSourceResponse } from '@/api/generated/api';

import { markQuote, pageQuotes } from './source-match';
import { ZoomBar } from './zoom-bar';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfSourceView({
  source,
  quote,
  onNotFound,
}: {
  source: ImportSourceResponse;
  quote: string | null;
  onNotFound: () => void;
}) {
  const url = source.original.url;
  const [loaded, setLoaded] = useState<{ url: string; pdf: PDFDocumentProxy } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const pdf = loaded?.url === url ? loaded.pdf : null;
  const failed = failedUrl === url;
  const [pageNumber, setPageNumber] = useState(source.page ?? source.match?.page ?? 1);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  const firstPage = useRef(pageNumber);
  const reportNotFound = useEffectEvent(() => onNotFound());

  // Destroying the task rejects its promise, which is no failure: React's development mode
  // mounts twice, and a new link replaces the old one.
  useEffect(() => {
    let cancelled = false;
    const task = getDocument({ url });
    task.promise.then(
      (document) => {
        if (!cancelled) setLoaded({ url, pdf: document });
      },
      () => {
        if (!cancelled) setFailedUrl(url);
      }
    );
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

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
        if (cancelled || !quote) return;
        layer.replaceChildren();
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
        else if (!reported.current && pageNumber === firstPage.current) {
          reported.current = true;
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
