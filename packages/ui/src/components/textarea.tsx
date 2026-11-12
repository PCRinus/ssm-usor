import { cn } from 'cn';
import * as React from 'react';

// Baseline only since 2026: Safari before 26.2 and Firefox before 152 size a textarea by its rows.
const sizesToContent = () =>
  typeof CSS === 'undefined' ||
  typeof CSS.supports !== 'function' ||
  CSS.supports('field-sizing', 'content');

function fitToText(box: HTMLTextAreaElement) {
  box.style.height = 'auto';
  box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;
}

function Textarea({
  className,
  size = 'default',
  ref,
  onInput,
  ...props
}: React.ComponentProps<'textarea'> & {
  size?: 'default' | 'line';
}) {
  const own = React.useRef<HTMLTextAreaElement>(null);
  const grows = size === 'line' && !sizesToContent();
  React.useLayoutEffect(() => {
    if (grows && own.current) fitToText(own.current);
  });
  return (
    <textarea
      data-slot="textarea"
      rows={size === 'line' ? 1 : undefined}
      ref={(node) => {
        own.current = node;
        if (typeof ref === 'function') return ref(node);
        if (ref) ref.current = node;
      }}
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
        // Chromium draws an Input's 14px text a pixel below the centre of its box; the uneven
        // padding from `md` keeps both baselines level.
        size === 'line' && 'min-h-11 resize-none py-[9px] md:pt-3 md:pb-2.5',
        grows && 'overflow-hidden',
        className
      )}
      onInput={(event) => {
        if (grows) fitToText(event.currentTarget);
        onInput?.(event);
      }}
      {...props}
    />
  );
}

export { Textarea };
