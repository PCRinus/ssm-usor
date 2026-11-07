import { cn } from '@ssm-usor/ui/lib/utils';
import { createLink, type LinkComponent, useLocation } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

const tabBase =
  'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-[10px] border border-b-0 border-border text-sm outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';
const tabInactive =
  'mb-px h-10 bg-section-tab px-[15px] font-medium text-section-tab-foreground hover:bg-section-tab-hover hover:text-foreground';
const tabActive =
  'h-[46px] bg-(--section-tab-surface) px-[18px] font-semibold text-foreground shadow-[0_-3px_8px_rgb(24_52_46/0.07)]';

function TabsFrame({
  list: List,
  listProps,
  surface,
  revealKey,
  children,
}: {
  list: 'ul' | 'div';
  listProps?: ComponentProps<'div'>;
  surface: string;
  revealKey?: unknown;
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
    if (bounds.left < visible.left) viewport.scrollLeft -= visible.left - bounds.left + 8;
    if (bounds.right > visible.right) viewport.scrollLeft += bounds.right - visible.right + 8;
    updateScrollState();
  }, [updateScrollState]);

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
          <ul ref={attachList} className={listClass}>
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

// Nested under another one, it stays in the flow: two sticky navs would cover each other.
export function SectionNav({
  label,
  nested = false,
  children,
}: {
  label: string;
  nested?: boolean;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className={cn('min-w-0 bg-background', !nested && 'sticky top-16 z-20')}
    >
      <TabsFrame list="ul" surface="var(--color-background)">
        {children}
      </TabsFrame>
    </nav>
  );
}

function SectionNavAnchor({
  icon: Icon,
  className,
  children,
  ...props
}: ComponentProps<'a'> & { icon: LucideIcon }) {
  return (
    <a
      {...props}
      className={cn(tabBase, props['aria-current'] === 'page' ? tabActive : tabInactive, className)}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </a>
  );
}

const SectionNavTabLink = createLink(SectionNavAnchor);

export const SectionNavLink: LinkComponent<typeof SectionNavAnchor> = (props) => (
  <li className="flex shrink-0">
    <SectionNavTabLink resetScroll={false} {...props} />
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
