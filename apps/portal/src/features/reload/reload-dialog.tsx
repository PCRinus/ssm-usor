import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, Hourglass, Info, RotateCw } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { dismissNewVersionToast } from './new-version-toast';
import {
  type OutdatedState,
  type ReloadContext,
  reloadPortal,
  useOutdatedState,
} from './reload-store';

export function ReloadDialog() {
  const outdated = useOutdatedState();
  if (!outdated) return null;
  return <OutdatedDialog outdated={outdated} />;
}

const secondsUntil = (until: number | null) =>
  until === null ? 0 : Math.max(0, Math.ceil((until - Date.now()) / 1000));

function useSecondsLeft(until: number | null) {
  const [seconds, setSeconds] = useState(() => secondsUntil(until));
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => {
      const next = secondsUntil(until);
      setSeconds(next);
      if (next === 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [until]);
  return seconds;
}

function OutdatedDialog({ outdated }: { outdated: OutdatedState }) {
  const { t } = useLingui();
  const secondsLeft = useSecondsLeft(outdated.lockedUntil);
  const locked = secondsLeft > 0;
  const countdown = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const { context } = outdated;

  useEffect(() => {
    dismissNewVersionToast();
  }, []);

  return (
    <Dialog open>
      <DialogContent
        data-testid="reload-dialog"
        data-locked={locked}
        data-reload-dialog=""
        showCloseButton={false}
        // The only button would otherwise take focus and show its ring before anyone pressed a key.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className={cn(
          'gap-5 border-0 bg-card p-7 shadow-[0_30px_80px_rgb(15_36_31/0.35)] sm:max-w-[31.25rem] sm:rounded-2xl',
          'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[92svh] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-[1.125rem] max-sm:rounded-b-none max-sm:px-5 max-sm:pt-6 max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-sm:shadow-[0_-10px_40px_rgb(15_36_31/0.25)]',
          'max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=open]:zoom-in-100'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-11 place-items-center rounded-xl',
            locked ? 'bg-warning text-warning-foreground' : 'bg-info text-foreground'
          )}
        >
          {locked ? <Hourglass className="size-5" /> : <RotateCw className="size-5" />}
        </span>
        <div className="grid gap-2">
          <DialogTitle className="text-[1.3125rem] leading-tight font-bold tracking-tight sm:text-[1.375rem]">
            {locked ? t`Actualizarea nu s-a încheiat încă` : t`Pagina trebuie reîncărcată`}
          </DialogTitle>
          <DialogDescription className="text-[0.9375rem] leading-relaxed text-foreground/85 sm:text-base">
            {locked ? (
              <Trans>
                Portalul se actualizează chiar acum și durează de obicei un minut sau două. Poți
                reîncărca peste un minut.
              </Trans>
            ) : (
              <ReloadReason context={context} />
            )}
          </DialogDescription>
        </div>
        <Reassurance context={context} />
        <Button
          data-testid="reload-dialog-action"
          className="mt-1 h-12 w-full rounded-xl text-base font-semibold"
          disabled={locked}
          onClick={() => reloadPortal('dialog')}
        >
          {locked ? (
            <span className="tabular-nums">{t`Reîncarcă în ${countdown}`}</span>
          ) : (
            <>
              <RotateCw aria-hidden="true" />
              <Trans>Reîncarcă</Trans>
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ReloadReason({ context }: { context: ReloadContext }) {
  if (context.kind === 'test') {
    return (
      <Trans>Am actualizat portalul între timp. Reîncarcă pagina ca să continui testul.</Trans>
    );
  }
  if (context.kind === 'signing') {
    return <Trans>Am actualizat portalul între timp. Reîncarcă pagina ca să semnezi.</Trans>;
  }
  return <Trans>Am actualizat portalul între timp. Reîncarcă pagina ca să continui.</Trans>;
}

function Reassurance({ context }: { context: ReloadContext }) {
  if (context.kind === 'signing') {
    return context.signedBefore ? (
      <SafeLine tone="success">
        <Trans>
          Documentele semnate rămân semnate. După reîncărcare le poți semna pe celelalte.
        </Trans>
      </SafeLine>
    ) : (
      <SafeLine tone="muted">
        <Trans>Nu s-a semnat încă nimic. După reîncărcare poți semna.</Trans>
      </SafeLine>
    );
  }
  if (context.kind === 'test' && context.sending) {
    return (
      <SafeLine tone="success">
        <Trans>Toate răspunsurile sunt salvate. După reîncărcare trimite testul din nou.</Trans>
      </SafeLine>
    );
  }
  if (context.kind === 'test') {
    const current = context.question;
    const previous = current - 1;
    return (
      <SafeLine tone="success">
        {previous === 0 ? (
          <Trans>
            Testul rămâne deschis. După reîncărcare vei bifa din nou răspunsul la întrebarea{' '}
            {current}.
          </Trans>
        ) : previous === 1 ? (
          <Trans>
            Răspunsul la întrebarea 1 este salvat. După reîncărcare vei bifa din nou răspunsul la
            întrebarea {current}.
          </Trans>
        ) : (
          <Trans>
            Răspunsurile la întrebările 1–{previous} sunt salvate. După reîncărcare vei bifa din nou
            răspunsul la întrebarea {current}.
          </Trans>
        )}
      </SafeLine>
    );
  }
  return (
    <SafeLine tone="success">
      <Trans>Nimic din ce ai trimis deja nu se pierde.</Trans>
    </SafeLine>
  );
}

function SafeLine({ tone, children }: { tone: 'success' | 'muted'; children: ReactNode }) {
  const Icon = tone === 'success' ? Check : Info;
  return (
    <p
      data-testid="reload-dialog-safe"
      className={cn(
        'flex items-start gap-3 rounded-[0.625rem] border px-3.5 py-3 text-sm leading-normal',
        tone === 'success'
          ? 'border-success-border bg-success text-success-foreground'
          : 'border-border bg-muted text-foreground'
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
