import { Button } from '@ssm-usor/ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ssm-usor/ui/components/tooltip';
import { cn } from '@ssm-usor/ui/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import type { StripPhoto } from './photo-strip-model';

const frameSizes = {
  bar: 'h-[52px] w-11',
  viewer: 'h-[52px] w-11 sm:h-11 sm:w-[34px]',
} as const;

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

type Overflow = { overflowing: boolean; atStart: boolean; atEnd: boolean };

// A focus the member did not move with the keyboard, such as one given back when a dialog closes,
// opens no preview over the page.
let keyboardMoving = false;
const navigationKeys = new Set(['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
const onKey = (event: globalThis.KeyboardEvent) => {
  keyboardMoving = navigationKeys.has(event.key);
};
const onPointer = () => {
  keyboardMoving = false;
};
let listening = 0;

function useKeyboardMoves() {
  useEffect(() => {
    if (listening++ === 0) {
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('pointerdown', onPointer, true);
    }
    return () => {
      if (--listening === 0) {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('pointerdown', onPointer, true);
      }
    };
  }, []);
}

export function PhotoStrip({
  photos,
  ringed,
  underlined,
  onOpen,
  label,
  description,
  size = 'bar',
  preview = size === 'bar',
  positionClassName,
  className,
  testId = 'photo-strip',
}: {
  photos: StripPhoto[];
  ringed: string | null;
  underlined: ReadonlySet<string>;
  onOpen: (key: string) => void;
  label: string;
  description?: string;
  size?: keyof typeof frameSizes;
  preview?: boolean;
  positionClassName?: string;
  className?: string;
  testId?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const opener = useRef(onOpen);
  useLayoutEffect(() => {
    opener.current = onOpen;
  });
  const open = useCallback((key: string) => opener.current(key), []);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  useKeyboardMoves();
  const [overflow, setOverflow] = useState<Overflow>({
    overflowing: false,
    atStart: true,
    atEnd: true,
  });
  const measure = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const overflowing = element.scrollWidth > element.clientWidth + 1;
    const atStart = element.scrollLeft <= 1;
    const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - 1;
    setOverflow((previous) =>
      previous.overflowing === overflowing &&
      previous.atStart === atStart &&
      previous.atEnd === atEnd
        ? previous
        : { overflowing, atStart, atEnd }
    );
  }, []);

  useLayoutEffect(() => {
    measure();
    const element = scroller.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, photos.length]);

  useEffect(() => {
    const element = scroller.current;
    const frame = element?.querySelector<HTMLElement>('[data-ringed]');
    if (!element || !frame) return;
    const box = element.getBoundingClientRect();
    const own = frame.getBoundingClientRect();
    if (own.left >= box.left && own.right <= box.right) return;
    element.scrollBy({
      left: own.left - box.left - own.width * 0.6,
      behavior: calm() ? 'auto' : 'smooth',
    });
  }, [ringed]);

  const page = (direction: 1 | -1) => {
    const element = scroller.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: calm() ? 'auto' : 'smooth',
    });
  };

  const ringIndex = photos.findIndex((photo) => photo.key === ringed);
  const stop =
    photos.find((photo) => photo.key === focusKey)?.key ?? ringed ?? photos[0]?.key ?? null;

  function move(event: KeyboardEvent) {
    const frames = [...(scroller.current?.querySelectorAll<HTMLElement>('[data-photo-key]') ?? [])];
    const at = frames.findIndex((frame) => frame === document.activeElement);
    if (at === -1) return;
    const to =
      event.key === 'ArrowRight'
        ? Math.min(at + 1, frames.length - 1)
        : event.key === 'ArrowLeft'
          ? Math.max(at - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? frames.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    event.stopPropagation();
    const target = frames[to]!;
    setFocusKey(target.dataset.photoKey!);
    target.focus();
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const descriptionProps = description
    ? { title: description, 'aria-description': description }
    : {};

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={150}>
      <div className={cn('flex min-w-0 items-center gap-2', className)} data-testid={testId}>
        <div
          ref={scroller}
          role="group"
          aria-label={label}
          {...descriptionProps}
          onScroll={measure}
          onKeyDown={move}
          className={cn(
            'flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            overflow.overflowing &&
              !overflow.atEnd &&
              'mask-r-from-[calc(100%-1.5rem)] mask-r-to-100%'
          )}
          data-testid={`${testId}-frames`}
        >
          {photos.map((photo, index) => (
            <Frame
              key={photo.key}
              photo={photo}
              number={index + 1}
              total={photos.length}
              ringed={photo.key === ringed}
              underlined={photo.key !== ringed && underlined.has(photo.key)}
              tabbable={photo.key === stop}
              size={size}
              preview={preview}
              onOpen={open}
            />
          ))}
        </div>
        {overflow.overflowing && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              className="max-sm:hidden"
              aria-label="Fotografiile dinainte"
              disabled={overflow.atStart}
              onClick={() => page(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span
              className={cn(
                'min-w-14 text-center text-sm whitespace-nowrap text-muted-foreground tabular-nums',
                positionClassName
              )}
              data-testid={`${testId}-position`}
            >
              {Math.max(ringIndex, 0) + 1} din {photos.length}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              className="max-sm:hidden"
              aria-label="Fotografiile de după"
              disabled={overflow.atEnd}
              onClick={() => page(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

const Frame = memo(function Frame({
  photo,
  number,
  total,
  ringed,
  underlined,
  tabbable,
  size,
  preview,
  onOpen,
}: {
  photo: StripPhoto;
  number: number;
  total: number;
  ringed: boolean;
  underlined: boolean;
  tabbable: boolean;
  size: keyof typeof frameSizes;
  preview: boolean;
  onOpen: (key: string) => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const hovered = useRef(false);
  const button = (
    <button
      type="button"
      aria-label={photo.label}
      aria-current={ringed || undefined}
      tabIndex={tabbable ? 0 : -1}
      data-photo-key={photo.key}
      data-ringed={ringed || undefined}
      data-underlined={underlined || undefined}
      data-testid="photo-strip-frame"
      onPointerMove={() => {
        hovered.current = true;
      }}
      onPointerLeave={() => {
        hovered.current = false;
      }}
      onClick={() => {
        hovered.current = false;
        onOpen(photo.key);
      }}
      className={cn(
        "group/frame grid shrink-0 cursor-pointer justify-items-stretch gap-1 rounded-md outline-none after:h-[3px] after:rounded-full after:content-['']",
        underlined && 'after:bg-foreground'
      )}
    >
      <span
        className={cn(
          'relative block overflow-hidden rounded-md border bg-secondary transition-[filter] group-hover/frame:brightness-95 group-focus-visible/frame:ring-[3px] group-focus-visible/frame:ring-ring/50',
          frameSizes[size],
          ringed && 'outline-2 outline-offset-2 outline-foreground'
        )}
      >
        {photo.thumb('size-full rounded-none')}
        <span
          aria-hidden="true"
          className={cn(
            'absolute bottom-0.5 left-0.5 min-w-[17px] rounded-[4px] px-1 text-center text-[11px] leading-4 font-semibold tabular-nums',
            ringed ? 'bg-foreground text-background' : 'bg-card text-foreground'
          )}
        >
          {number}
        </span>
      </span>
    </button>
  );
  if (!preview) return button;
  return (
    <Tooltip
      open={previewing}
      onOpenChange={(next) => setPreviewing(next && (hovered.current || keyboardMoving))}
    >
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="grid gap-2 border bg-card p-2.5 text-foreground shadow-lg"
        arrowClassName="bg-card fill-card"
      >
        {photo.thumb('h-48 w-36 rounded-md')}
        <span className="grid text-xs">
          <span className="font-semibold tabular-nums">
            Fotografia {number} din {total}
          </span>
          <span className="text-muted-foreground">{photo.caption}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
});
