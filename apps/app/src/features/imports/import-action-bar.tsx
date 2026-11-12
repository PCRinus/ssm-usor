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
  error,
  leading,
  children,
  testId = 'import-action-bar',
}: {
  label: string;
  save?: ImportSaveState;
  summary?: ReactNode;
  note?: ReactNode;
  error?: string | null;
  leading?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const bar = useRef<HTMLElement>(null);
  const space = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ left: number; width: number; bottom: number }>();
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
    const content = placeholder.closest('main');
    const root = document.documentElement;
    const previous = root.style.scrollPaddingBottom;
    const update = () => {
      const height = element.getBoundingClientRect().height;
      if (placeholder.style.height !== `${height}px`) placeholder.style.height = `${height}px`;
      const { left, width } = placeholder.getBoundingClientRect();
      const boundary = content?.getBoundingClientRect();
      const bottom =
        !keyboard.open && boundary && boundary.height > 0
          ? Math.max(0, window.innerHeight - boundary.bottom)
          : 0;
      setBounds((previous) =>
        previous?.left === left && previous.width === width && previous.bottom === bottom
          ? previous
          : { left, width, bottom }
      );
      const padding = `${height + bottom + 16}px`;
      if (root.style.scrollPaddingBottom !== padding) root.style.scrollPaddingBottom = padding;
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    observer?.observe(placeholder);
    if (content) observer?.observe(content);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
      root.style.scrollPaddingBottom = previous;
    };
  }, [keyboard.open]);

  return (
    <div ref={space} className="-mx-5 -mb-6 sm:-mx-8 lg:-mx-10">
      <section
        ref={bar}
        aria-label={label}
        data-testid={testId}
        data-import-action-bar=""
        data-keyboard-open={keyboard.open || undefined}
        style={{ ...bounds, bottom: keyboard.open ? keyboard.bottom : (bounds?.bottom ?? 0) }}
        className={cn(
          'fixed bottom-0 z-20 grid gap-3 border-t border-sidebar-border bg-sidebar px-5 pt-3 text-sidebar-foreground shadow-[0_-4px_14px_rgb(24_52_46/0.08)] sm:px-8 sm:pt-4 lg:px-10',
          leading && 'md:pt-2.5',
          keyboard.open
            ? 'pb-3'
            : leading
              ? 'pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-[calc(0.625rem+env(safe-area-inset-bottom))]'
              : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1rem+env(safe-area-inset-bottom))]'
        )}
      >
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="import-action-error">
            {error}
          </p>
        )}
        {leading ? (
          <div className="grid min-w-0 gap-2.5 md:flex md:items-center md:gap-6">
            {!keyboard.open && (
              <div className="min-w-0 md:flex-[0_1_auto]" data-testid="import-action-leading">
                {leading}
              </div>
            )}
            <div className="flex min-w-0 items-center justify-between gap-3 md:ml-auto md:shrink-0 md:gap-6">
              <div className="grid min-w-0 justify-items-start gap-0.5 md:shrink-0 md:border-l md:border-sidebar-border md:pl-6 md:whitespace-nowrap">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {summary && (
                    <div className="text-sm font-semibold" data-testid="import-action-summary">
                      {summary}
                    </div>
                  )}
                  {save && <SaveRecovery save={save} />}
                </div>
                {save && <SaveLabel save={save} />}
                {!keyboard.open && note && (
                  <span className="text-[13px] text-muted-foreground">{note}</span>
                )}
              </div>
              {!keyboard.open && (
                <div
                  className="flex shrink-0 items-center gap-2"
                  data-testid="import-action-buttons"
                >
                  {children}
                </div>
              )}
            </div>
          </div>
        ) : (
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
              {!keyboard.open && note && (
                <span className="text-[13px] text-muted-foreground">{note}</span>
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
        )}
      </section>
    </div>
  );
}

const saveFailed = (save: ImportSaveState) => save.conflict || Boolean(save.error);

function ImportSaveStatus({ save }: { save: ImportSaveState }) {
  const failed = saveFailed(save);
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
      <SaveText save={save} role="status" />
      <SaveRecovery save={save} />
    </div>
  );
}

function SaveLabel({ save }: { save: ImportSaveState }) {
  const failed = saveFailed(save);
  return (
    <div
      data-testid={
        save.conflict ? 'import-review-conflict' : save.error ? 'import-review-error' : undefined
      }
      className={cn('text-[13px]', failed ? 'text-destructive' : 'text-muted-foreground')}
    >
      <SaveText key={String(failed)} save={save} role={failed ? 'alert' : 'status'} />
    </div>
  );
}

function SaveText({ save, role }: { save: ImportSaveState; role: 'status' | 'alert' }) {
  const failed = saveFailed(save);
  const saving = save.saving && !failed;
  const Icon = failed ? TriangleAlert : saving ? LoaderCircle : Check;
  const label = save.conflict
    ? 'Propunerea s-a schimbat. Schimbarea ta nu s-a salvat.'
    : save.error
      ? 'Ultima schimbare nu s-a salvat.'
      : saving
        ? 'Se salvează…'
        : 'Salvat în propunere';
  const cause = !save.conflict && save.error && save.error !== label ? save.error : null;
  return (
    <span
      role={role}
      aria-live={role === 'status' ? 'polite' : undefined}
      title={cause ?? undefined}
      className="flex items-center gap-1.5"
      data-testid="import-save-status"
    >
      <Icon
        aria-hidden="true"
        className={cn('size-4 shrink-0', saving && 'animate-spin motion-reduce:animate-none')}
      />
      {label}
      {cause && <span className="sr-only"> {cause}</span>}
    </span>
  );
}

function SaveRecovery({ save }: { save: ImportSaveState }) {
  if (!saveFailed(save)) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={save.conflict ? () => void save.reload() : save.retry}
    >
      {save.conflict ? 'Reîncarcă propunerea' : 'Salvează din nou'}
    </Button>
  );
}
