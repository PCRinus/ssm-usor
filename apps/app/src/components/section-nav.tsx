import { useLocation } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export function SectionNav({ label, children }: { label: string; children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
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
    const active = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
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
  }, [pathname, revealActive]);

  function scroll(direction: -1 | 1) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({
      left: direction * Math.max(viewport.clientWidth * 0.75, 160),
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  return (
    <nav aria-label={label} className="sticky top-16 z-20 min-w-0 border-b bg-background">
      <div className="relative min-w-0 overflow-hidden">
        <div
          ref={viewportRef}
          data-slot="section-nav-viewport"
          className="min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={updateScrollState}
        >
          <ul ref={listRef} className="-mb-px flex w-max min-w-full gap-1">
            {children}
          </ul>
        </div>
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Derulează secțiunile spre stânga"
            onClick={() => scroll(-1)}
            className="absolute inset-y-0 left-0 flex w-10 items-center justify-start bg-linear-to-r from-background from-45% to-transparent pl-0.5 text-foreground focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            <span className="flex size-7 items-center justify-center rounded-full border bg-background shadow-xs">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </span>
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            aria-label="Derulează secțiunile spre dreapta"
            onClick={() => scroll(1)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-linear-to-l from-background from-45% to-transparent pr-0.5 text-foreground focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            <span className="flex size-7 items-center justify-center rounded-full border bg-background shadow-xs">
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
