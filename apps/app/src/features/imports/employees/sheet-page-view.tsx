import { cn } from '@ssm-usor/ui/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { LoaderCircle } from 'lucide-react';
import {
  lazy,
  type RefObject,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ImportSourceResponse } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { importErrorMessage } from '../import-format';
import { sourceQuery, viewerChunks } from '../source-query';
import { centreOn, placeIn, type SpotBox, spotZoom } from '../spot-zoom';
import { Spotlight, SpotlightToggle } from '../spotlight';
import { ZoomBar } from '../zoom-bar';
import type { SheetPage } from './employee-review-model';
import { pageFileName } from './review-format';
import { spotBox } from './spot-targets';

const PdfSourceView = lazy(viewerChunks.pdf);

// An import locates its pages once it is ready, so a page opened before then is asked for again
// the next time it opens.
const notLocated = (answer: ImportSourceResponse) => answer.locations === null;

// Asking again for the boxes signs the links anew; the photo keeps the link it opened with while
// that lasts, so the image is not downloaded a second time.
function useHeldLink(answer: ImportSourceResponse | undefined, answeredAt: number) {
  const link = answer ? (answer.derived?.url ?? answer.original.url) : null;
  const [held, setHeld] = useState<{ fileId: string; link: string; until: number } | null>(null);
  const keeps = answer !== undefined && held?.fileId === answer.fileId && answeredAt < held.until;
  if (answer && link && !keeps && held?.link !== link) {
    const life = Math.max(0, answer.expiresInSeconds - 60) * 1000;
    setHeld({ fileId: answer.fileId, link, until: answeredAt + life });
  }
  return keeps ? held.link : link;
}

export function SheetPageView({
  importId,
  page,
  spot = null,
  className,
  onEnlarge,
}: {
  importId: string;
  page: SheetPage;
  spot?: string | null;
  className?: string;
  onEnlarge?: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const query = useQuery(
    sourceQuery(importId, { file: page.label }, apiRequest, queryClient, notLocated)
  );
  const locations = query.data?.locations ?? null;
  const box = useMemo(() => spotBox(locations, spot), [locations, spot]);
  const link = useHeldLink(query.data, query.dataUpdatedAt);
  return (
    <div
      className={cn('relative overflow-hidden rounded-lg bg-muted/60', className)}
      data-testid="sheet-page-view"
    >
      {query.isError ? (
        <div className="p-4">
          <Notice variant="destructive">
            {importErrorMessage(query.error, 'Nu am putut deschide fotografia. Încearcă din nou.')}
          </Notice>
        </div>
      ) : !query.data ? (
        <div className="grid h-full min-h-48 place-items-center" aria-busy="true">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : query.data.page !== null ? (
        <Suspense fallback={null}>
          <PdfSourceView
            key={query.data.fileId}
            source={query.data}
            quote={null}
            spot={box}
            onShown={() => undefined}
            onNotFound={() => undefined}
            onEnlarge={onEnlarge}
          />
        </Suspense>
      ) : (
        <PhotoView
          key={box ? `${box.top} ${box.left} ${box.bottom} ${box.right}` : 'whole'}
          url={link ?? query.data.original.url}
          name={pageFileName(page)}
          spot={box}
          onEnlarge={onEnlarge}
        />
      )}
    </div>
  );
}

type Frame = { left: number; top: number; width: number; height: number };

function useImageFrame(
  scroller: RefObject<HTMLDivElement | null>,
  image: RefObject<HTMLImageElement | null>
) {
  const [frame, setFrame] = useState<Frame | null>(null);
  useEffect(() => {
    const room = scroller.current;
    const shown = image.current;
    if (!room || !shown) return;
    const measure = () => {
      if (shown.naturalWidth === 0) return;
      setFrame(placeIn(room, shown));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    observer.observe(shown);
    shown.addEventListener('load', measure);
    return () => {
      observer.disconnect();
      shown.removeEventListener('load', measure);
    };
  }, [scroller, image]);
  return frame;
}

function PhotoView({
  url,
  name,
  spot,
  onEnlarge,
}: {
  url: string;
  name: string;
  spot: SpotBox | null;
  onEnlarge?: () => void;
}) {
  const [view, setView] = useState<{ zoom: number | 'fit'; centre: boolean }>({
    zoom: 'fit',
    centre: false,
  });
  const [whole, setWhole] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const frame = useImageFrame(scroller, image);
  const { zoom } = view;

  useLayoutEffect(() => {
    if (view.centre && spot && scroller.current && image.current) {
      centreOn(scroller.current, image.current, spot);
    }
  }, [view, spot]);

  const bringIntoView = (shown: HTMLImageElement) => {
    const room = scroller.current;
    if (!spot || !room) return;
    const style = getComputedStyle(room);
    const width = room.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height =
      room.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const page = { width: shown.naturalWidth, height: shown.naturalHeight };
    const fitWidth = Math.min(width, (height * page.width) / page.height, page.width);
    setView({
      zoom: spotZoom({ box: spot, page, room: { width, height }, unit: width, fitWidth }) ?? 'fit',
      centre: true,
    });
  };

  return (
    <>
      <div ref={scroller} className="relative h-full overflow-auto p-3">
        <img
          data-no-replay
          ref={image}
          src={url}
          alt={`Fotografia ${name}`}
          data-testid="sheet-page-image"
          onClick={onEnlarge}
          onLoad={(event) => bringIntoView(event.currentTarget)}
          className={cn(
            'mx-auto block bg-card shadow-sm',
            zoom === 'fit' && 'max-h-full max-w-full object-contain',
            onEnlarge && 'cursor-zoom-in'
          )}
          style={zoom === 'fit' ? undefined : { width: `${zoom * 100}%`, maxWidth: 'none' }}
        />
        {spot && (
          <Spotlight
            box={spot}
            dimmed={!whole}
            size={frame}
            style={frame ?? { inset: 0, visibility: 'hidden' }}
          />
        )}
      </div>
      <ZoomBar
        zoom={zoom}
        onZoom={(next) => setView({ zoom: next, centre: false })}
        fit
        onEnlarge={onEnlarge}
        above={spot && <SpotlightToggle whole={whole} onWhole={setWhole} />}
      />
    </>
  );
}
