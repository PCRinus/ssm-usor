'use client';

import { cn } from 'cn';
import * as React from 'react';

type HiddenEdges = { start: boolean; end: boolean };

// Phones and macOS hide the scrollbar until the user scrolls, so nothing else says a
// column is cut off.
function useHiddenEdges(scroller: React.RefObject<HTMLDivElement | null>): HiddenEdges {
  const [start, setStart] = React.useState(false);
  const [end, setEnd] = React.useState(false);

  React.useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => {
      const left = element.scrollLeft;
      // Zoom gives fractional widths, so a scroller at its end can still be a pixel short.
      setStart(left > 1);
      setEnd(element.scrollWidth - element.clientWidth - left > 1);
    };
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      element.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [scroller]);

  return { start, end };
}

const edgeShade = 'pointer-events-none absolute inset-y-0 w-4 transition-opacity duration-200';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const hidden = useHiddenEdges(scroller);

  return (
    // min-w-0: unlike a scroll container, a flex or grid item is otherwise at least as wide
    // as the table inside it, and the page scrolls sideways instead of the table.
    <div data-slot="table-frame" className="relative w-full min-w-0">
      <div ref={scroller} data-slot="table-container" className="relative w-full overflow-x-auto">
        <table
          data-slot="table"
          className={cn('w-full caption-bottom text-sm', className)}
          {...props}
        />
      </div>
      <div
        aria-hidden="true"
        className={cn(
          edgeShade,
          'left-0 bg-linear-to-r from-foreground/7 to-transparent',
          hidden.start ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          edgeShade,
          'right-0 bg-linear-to-l from-foreground/7 to-transparent',
          hidden.end ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
        className
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
