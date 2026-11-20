import { cn } from '@ssm-usor/ui/lib/utils';
import { createLink, type LinkComponent, useLocation } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import {
  type ComponentProps,
  createContext,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { keepOpener } from '@/app/opener';

import { phoneStripInset } from './page-spacing';

const tabBase =
  'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-[10px] border border-b-0 border-border text-sm outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';
const tabInactive =
  'mb-px h-10 bg-section-tab px-[15px] font-medium text-section-tab-foreground hover:bg-section-tab-hover hover:text-foreground';
const tabActive =
  'h-[46px] bg-(--section-tab-surface) px-[18px] font-semibold text-foreground shadow-[0_-3px_8px_rgb(24_52_46/0.07)]';
const folderTabActive =
  'h-[46px] bg-card px-[15px] font-semibold text-foreground shadow-[0_-3px_8px_rgb(24_52_46/0.07)]';

type SectionNavVariant = 'tabs' | 'folder';

const SectionNavVariantContext = createContext<SectionNavVariant>('tabs');

function TabsFrame({
  list: List,
  listProps,
  surface,
  revealKey,
  revealInset = 0,
  className,
  children,
}: {
  list: 'ul' | 'div';
  listProps?: ComponentProps<'div'>;
  surface: string;
  revealKey?: unknown;
  revealInset?: number;
  className?: string;
  children: ReactNode;
}) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const attachList = useCallback((node: HTMLElement | null) => {
    listRef.current = node;
  }, []);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setCanScrollLeft(viewport.scrollLeft > 2);
    setCanScrollRight(viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft > 2);
  }, []);

  const revealActive = useCallback(() => {
    const viewport = viewportRef.current;
    const active = listRef.current?.querySelector<HTMLElement>(
      '[aria-current="page"], [aria-selected="true"]'
    );
    if (!viewport || !active) return;
    const bounds = active.getBoundingClientRect();
    const visible = viewport.getBoundingClientRect();
    const left = visible.left + revealInset;
    const right = visible.right - revealInset;
    if (bounds.left < left) viewport.scrollLeft -= left - bounds.left + 8;
    if (bounds.right > right) viewport.scrollLeft += bounds.right - right + 8;
    updateScrollState();
  }, [revealInset, updateScrollState]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;
    const resize = () => {
      revealActive();
      updateScrollState();
    };
    resize();
    window.addEventListener('resize', resize);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(viewport);
    observer?.observe(list);
    return () => {
      window.removeEventListener('resize', resize);
      observer?.disconnect();
    };
  }, [revealActive, updateScrollState]);

  useEffect(() => {
    revealActive();
  }, [pathname, revealKey, revealActive]);

  function scroll(direction: -1 | 1) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({
      left: direction * Math.max(viewport.clientWidth * 0.75, 160),
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  const arrow =
    'group absolute top-0 bottom-px flex w-10 cursor-pointer items-end pb-1 from-(--section-tab-surface) from-45% to-transparent text-foreground outline-none focus-visible:[&>span]:outline-2 focus-visible:[&>span]:outline-offset-1 focus-visible:[&>span]:outline-ring';
  // Not a border on the nav: the viewport would clip the open tab, which has to cover the line.
  const listClass =
    'flex w-max min-w-full items-end gap-[3px] pt-2 shadow-[inset_0_-1px_0_var(--color-border)]';
  const arrowFace =
    'flex size-8 items-center justify-center rounded-full border bg-card shadow-xs transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground group-active:bg-primary/85';

  return (
    <div
      className="relative min-w-0 overflow-hidden"
      style={{ '--section-tab-surface': surface } as CSSProperties}
    >
      <div
        ref={viewportRef}
        data-slot="section-nav-viewport"
        className="min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
      >
        {List === 'ul' ? (
          <ul ref={attachList} className={cn(listClass, className)}>
            {children}
          </ul>
        ) : (
          <div {...listProps} ref={attachList} className={cn(listClass, listProps?.className)}>
            {children}
          </div>
        )}
      </div>
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Derulează secțiunile spre stânga"
          onClick={() => scroll(-1)}
          className={cn(arrow, 'left-0 justify-start bg-linear-to-r')}
        >
          <span className={arrowFace}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </span>
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          aria-label="Derulează secțiunile spre dreapta"
          onClick={() => scroll(1)}
          className={cn(arrow, 'right-0 justify-end bg-linear-to-l')}
        >
          <span className={arrowFace}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </button>
      )}
    </div>
  );
}

// The top bar is 64 px tall (top-16): a stuck strip sits right under it.
const stuckTop = 64;

function useStuck(ref: RefObject<HTMLElement | null>, watch: boolean) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!watch || !node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setStuck(entry!.intersectionRatio < 1 && entry!.boundingClientRect.top <= stuckTop + 0.5),
      { rootMargin: `-${stuckTop + 1}px 0px 0px 0px`, threshold: 1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, watch]);
  return stuck;
}

// Nested under another one, it stays in the flow: two sticky navs would cover each other.
// The folder variant's line is the top edge of the sheet that follows it (TabSheet).
export function SectionNav({
  label,
  nested = false,
  variant = 'tabs',
  className,
  children,
}: {
  label: string;
  nested?: boolean;
  variant?: SectionNavVariant;
  className?: string;
  children: ReactNode;
}) {
  const navRef = useRef<HTMLElement>(null);
  const stuck = useStuck(navRef, variant === 'folder' && !nested);
  return (
    <nav
      ref={navRef}
      aria-label={label}
      data-stuck={stuck || undefined}
      className={cn(
        'min-w-0 bg-background',
        !nested && 'sticky top-16 z-20',
        // The strip's line is close to the tab fill above it, so on its own it cannot part a stuck
        // strip from the rows passing beneath. Forced colours drop the line and the shade alike.
        stuck &&
          'after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-2.5 after:bg-linear-to-b after:from-[rgb(24_52_46/0.08)] after:to-transparent forced-colors:after:border-t',
        className
      )}
    >
      <SectionNavVariantContext value={variant}>
        <TabsFrame
          list="ul"
          surface="var(--color-background)"
          className={variant === 'folder' ? phoneStripInset : undefined}
          revealInset={variant === 'folder' ? 40 : 0}
        >
          {children}
        </TabsFrame>
      </SectionNavVariantContext>
    </nav>
  );
}

export const countPill =
  'shrink-0 rounded-full bg-brand-lime px-2 py-px text-xs font-semibold text-foreground tabular-nums';

function SectionNavAnchor({
  icon: Icon,
  count,
  countUnit,
  marker,
  className,
  children,
  ...props
}: ComponentProps<'a'> & {
  icon: LucideIcon;
  count?: number;
  countUnit?: string;
  marker?: ReactNode;
}) {
  const variant = useContext(SectionNavVariantContext);
  const open = props['aria-current'] === 'page';
  const folder = variant === 'folder';
  return (
    <a
      {...props}
      className={cn(
        tabBase,
        open ? (folder ? folderTabActive : tabActive) : tabInactive,
        className
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {folder && typeof children === 'string' ? (
        <span
          data-label={children}
          className="inline-flex flex-col after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)_/_'']"
        >
          {children}
        </span>
      ) : (
        children
      )}
      {marker}
      {count !== undefined && count > 0 && (
        <span data-testid="section-nav-count" className={countPill}>
          {count}
          {countUnit && <span className="sr-only"> {countUnit}</span>}
        </span>
      )}
    </a>
  );
}

const SectionNavTabLink = createLink(SectionNavAnchor);

// The tabs of a record are one place: moving between them keeps where the record was opened from.
export const SectionNavLink: LinkComponent<typeof SectionNavAnchor> = (props) => (
  <li className="flex shrink-0">
    <SectionNavTabLink resetScroll={false} state={keepOpener} {...props} />
  </li>
);

export function SectionTabs({
  label,
  value,
  surface = 'var(--color-background)',
  className,
  children,
}: {
  label: string;
  value: string;
  /** The colour of the panel the open tab opens onto. */
  surface?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TabsFrame
      list="div"
      listProps={{ role: 'tablist', 'aria-label': label, className }}
      surface={surface}
      revealKey={value}
    >
      {children}
    </TabsFrame>
  );
}

export function SectionTab({
  selected,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'role' | 'aria-selected'> & { selected: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      {...props}
      className={cn(tabBase, selected ? tabActive : tabInactive, className)}
    />
  );
}
