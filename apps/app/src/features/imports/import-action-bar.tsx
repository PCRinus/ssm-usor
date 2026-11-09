import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, LoaderCircle, TriangleAlert } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

export type ImportSaveState = {
  saving: boolean;
  error: string | null;
  conflict: boolean;
  retry: () => void;
  reload: () => void | Promise<void>;
};

export function ImportActionBar({
  label,
  save,
  summary,
  note,
  details,
  error,
  children,
  testId = 'import-action-bar',
}: {
  label: string;
  save?: ImportSaveState;
  summary?: ReactNode;
  note?: ReactNode;
  details?: ReactNode;
  error?: string | null;
  children: ReactNode;
  testId?: string;
}) {
  const bar = useRef<HTMLElement>(null);
  const space = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ left: number; width: number }>();
  const [keyboard, setKeyboard] = useState({ open: false, bottom: 0 });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let height = viewport.height;
    let width = viewport.width;
    let compact = false;
    const update = () => {
      const focused = document.activeElement;
      const editing =
        focused instanceof HTMLElement &&
        (focused.matches('input:not([type="checkbox"]):not([type="radio"]), textarea') ||
          focused.isContentEditable);
      if (width !== viewport.width) {
        height = viewport.height;
        width = viewport.width;
        compact = false;
      } else height = Math.max(height, viewport.height);
      const open =
        (editing || compact) &&
        window.matchMedia('(pointer: coarse)').matches &&
        height - viewport.height > 150;
      compact = open;
      setKeyboard({
        open,
        bottom: open ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0,
      });
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);

  useEffect(() => {
    const element = bar.current;
    const placeholder = space.current;
    if (!element || !placeholder) return;
    const root = document.documentElement;
    const previous = root.style.scrollPaddingBottom;
    const update = () => {
      const height = element.getBoundingClientRect().height;
      placeholder.style.height = `${height}px`;
      const { left, width } = placeholder.getBoundingClientRect();
      setBounds({ left, width });
      root.style.scrollPaddingBottom = `${height + 16}px`;
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    observer?.observe(placeholder);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      root.style.scrollPaddingBottom = previous;
    };
  }, []);

  return (
    <div ref={space} className="-mx-5 -mb-6 sm:-mx-8 lg:-mx-10">
      <section
        ref={bar}
        aria-label={label}
        data-testid={testId}
        data-import-action-bar=""
        data-keyboard-open={keyboard.open || undefined}
        style={{ bottom: keyboard.bottom, ...bounds }}
        className={cn(
          'fixed bottom-0 z-20 grid gap-3 border-t bg-card px-5 pt-3 shadow-[0_-10px_24px_-10px_rgba(24,52,46,0.18)] sm:px-8 sm:pt-4 lg:px-10',
          keyboard.open
            ? 'pb-3'
            : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1rem+env(safe-area-inset-bottom))]'
        )}
      >
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="import-action-error">
            {error}
          </p>
        )}
        <div className="grid min-w-0 gap-3 lg:flex lg:items-center lg:justify-between lg:gap-6">
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              {summary && (
                <div className="text-sm font-semibold" data-testid="import-action-summary">
                  {summary}
                </div>
              )}
              {save && <ImportSaveStatus save={save} />}
            </div>
            {!keyboard.open && (note || details) && (
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                {note && <span className="text-[13px] text-muted-foreground">{note}</span>}
                {details && (
                  <details
                    className="max-w-3xl text-sm open:basis-full"
                    data-testid="import-action-details"
                  >
                    <summary className="w-fit cursor-pointer rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                      Ce se schimbă
                    </summary>
                    <div className="mt-2 max-h-48 overflow-auto text-muted-foreground">
                      {details}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
          {!keyboard.open && (
            <div
              className="flex min-w-0 flex-wrap items-center gap-2 max-sm:[&>[data-size=default]]:flex-1 max-sm:[&>*>svg]:shrink-0 sm:shrink-0 sm:justify-end"
              data-testid="import-action-buttons"
            >
              {children}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ImportSaveStatus({ save }: { save: ImportSaveState }) {
  const failed = save.conflict || Boolean(save.error);
  const saving = save.saving && !failed;
  const Icon = failed ? TriangleAlert : saving ? LoaderCircle : Check;
  const label = save.conflict
    ? 'Propunerea s-a schimbat. Schimbarea ta nu s-a salvat.'
    : save.error
      ? 'Ultima schimbare nu s-a salvat.'
      : saving
        ? 'Se salvează…'
        : 'Salvat în propunere';
  return (
    <div
      data-testid={
        save.conflict ? 'import-review-conflict' : save.error ? 'import-review-error' : undefined
      }
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]',
        failed ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5"
        data-testid="import-save-status"
      >
        <Icon
          aria-hidden="true"
          className={cn('size-4 shrink-0', saving && 'animate-spin motion-reduce:animate-none')}
        />
        {label}
      </span>
      {failed && (
        <Button
          variant="outline"
          size="sm"
          onClick={save.conflict ? () => void save.reload() : save.retry}
        >
          {save.conflict ? 'Reîncarcă propunerea' : 'Salvează din nou'}
        </Button>
      )}
    </div>
  );
}
