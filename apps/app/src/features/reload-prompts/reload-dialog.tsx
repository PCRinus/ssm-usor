import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { cn } from '@ssm-usor/ui/lib/utils';
import { CircleCheck, Hourglass, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  type ReloadDialogState,
  reloadFromDialog,
  useReloadDialogState,
} from './reload-dialog-store';
import { reloadDialogText } from './reload-text';

function useSecondsLeft(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  const waiting = until !== null && now < until;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [waiting]);
  return waiting ? Math.ceil((until - now) / 1_000) : 0;
}

const countdown = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function Tile({ waiting }: { waiting: boolean }) {
  const Icon = waiting ? Hourglass : RotateCw;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-xl',
        waiting ? 'bg-warning text-warning-foreground' : 'bg-info text-info-foreground'
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

function KeptLine() {
  return (
    <p
      data-testid="reload-dialog-kept"
      className="flex items-start gap-3 rounded-[10px] border border-success-border bg-success px-3.5 py-[11px] text-sm leading-normal text-success-foreground"
    >
      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {reloadDialogText.kept}
    </p>
  );
}

function Description({ waiting, unsaved }: { waiting: boolean; unsaved: boolean }) {
  return (
    <>
      {waiting ? reloadDialogText.waitText : reloadDialogText.text}
      {unsaved && (
        <span
          className="mt-2 block font-medium text-foreground"
          data-testid="reload-dialog-unsaved"
        >
          {reloadDialogText.unsaved}
        </span>
      )}
    </>
  );
}

export function ReloadDialog() {
  const state = useReloadDialogState();
  return state ? <OpenReloadDialog state={state} /> : null;
}

function OpenReloadDialog({ state }: { state: ReloadDialogState }) {
  const secondsLeft = useSecondsLeft(state.lockedUntil);

  const waiting = secondsLeft > 0;

  // Radix at every width: a 426 mostly answers a save from inside an open Radix dialog, whose
  // focus trap and inert page would leave a dialog from another library unreachable.
  return (
    <Dialog open>
      <DialogContent
        data-testid="reload-dialog"
        data-phase={waiting ? 'waiting' : 'ready'}
        showCloseButton={false}
        overlayClassName="bg-[rgb(15_36_31/0.34)]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className={cn(
          'max-w-none gap-0 overflow-hidden rounded-2xl border-0 bg-card p-0 shadow-[0_30px_80px_rgb(15_36_31/0.35)] sm:max-w-none md:max-w-[500px]',
          'max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-h-[92dvh] max-md:translate-x-0 max-md:translate-y-0 max-md:overflow-y-auto max-md:rounded-t-[18px] max-md:rounded-b-none max-md:shadow-[0_-10px_40px_rgb(15_36_31/0.25)]',
          'max-md:data-[state=open]:slide-in-from-bottom max-md:data-[state=open]:zoom-in-100'
        )}
      >
        <div className="grid gap-4 px-7 pt-7 pb-[22px] max-md:gap-3 max-md:px-5 max-md:pt-6 max-md:pb-0">
          <Tile waiting={waiting} />
          <div className="grid gap-2 max-md:gap-3">
            <DialogTitle className="text-[21px] leading-[1.2] font-bold tracking-[-0.015em]">
              {waiting ? reloadDialogText.waitTitle : reloadDialogText.title}
            </DialogTitle>
            <DialogDescription className="text-[15px] leading-[1.55] text-release-body max-md:leading-normal">
              <Description waiting={waiting} unsaved={state.unsavedChange} />
            </DialogDescription>
          </div>
          {state.keptText && <KeptLine />}
        </div>
        <div className="flex items-center gap-3 border-t border-muted bg-background/60 py-3.5 pr-5 pl-7 max-md:flex-col-reverse max-md:items-stretch max-md:gap-2 max-md:border-0 max-md:bg-transparent max-md:px-5 max-md:pt-4 max-md:pb-[calc(2.125rem+env(safe-area-inset-bottom,0px))]">
          <p className="text-[13px] text-muted-foreground max-md:text-center">
            {waiting ? reloadDialogText.waitFooter : reloadDialogText.footer}
          </p>
          <Button
            data-testid="reload-dialog-action"
            className="ml-auto h-10 rounded-[10px] px-5 font-semibold tabular-nums max-md:ml-0 max-md:h-12 max-md:w-full max-md:rounded-xl max-md:text-[15px]"
            disabled={waiting}
            onClick={reloadFromDialog}
          >
            <RotateCw aria-hidden="true" />
            {waiting
              ? `${reloadDialogText.action} în ${countdown(secondsLeft)}`
              : reloadDialogText.action}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
