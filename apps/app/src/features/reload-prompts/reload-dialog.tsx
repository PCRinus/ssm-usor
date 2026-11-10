import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@ssm-usor/ui/components/drawer';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
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
    <p className="flex items-start gap-3 rounded-[10px] border border-success-border bg-success px-3.5 py-[11px] text-sm leading-normal text-success-foreground">
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

function ReloadButton({ secondsLeft, className }: { secondsLeft: number; className: string }) {
  return (
    <Button
      data-testid="reload-dialog-action"
      className={className}
      disabled={secondsLeft > 0}
      onClick={reloadFromDialog}
    >
      <RotateCw aria-hidden="true" />
      {secondsLeft > 0
        ? `${reloadDialogText.action} în ${countdown(secondsLeft)}`
        : reloadDialogText.action}
    </Button>
  );
}

export function ReloadDialog() {
  const state = useReloadDialogState();
  return state ? <OpenReloadDialog state={state} /> : null;
}

function OpenReloadDialog({ state }: { state: ReloadDialogState }) {
  const phone = useIsMobile();
  const secondsLeft = useSecondsLeft(state.lockedUntil);

  const waiting = secondsLeft > 0;
  const title = waiting ? reloadDialogText.waitTitle : reloadDialogText.title;
  const footer = waiting ? reloadDialogText.waitFooter : reloadDialogText.footer;
  const description = <Description waiting={waiting} unsaved={state.unsavedChange} />;

  if (phone) {
    return (
      <Drawer open disablePointerDismissal onOpenChange={(_open, details) => details.cancel()}>
        <DrawerContent
          data-testid="reload-dialog"
          data-state={waiting ? 'waiting' : 'ready'}
          className="h-auto max-h-[92dvh] bg-card [&>[data-slot=drawer-handle]]:hidden"
        >
          <div data-base-ui-swipe-ignore="" className="grid min-h-0 overflow-y-auto">
            <div className="grid gap-3 px-5 pt-6">
              <Tile waiting={waiting} />
              <DrawerTitle className="text-[21px] leading-[1.2] font-bold tracking-[-0.015em]">
                {title}
              </DrawerTitle>
              <DrawerDescription className="text-[15px] leading-normal text-release-body">
                {description}
              </DrawerDescription>
              <KeptLine />
            </div>
            <div className="grid gap-2 px-5 pt-4 pb-[calc(2.125rem+env(safe-area-inset-bottom,0px))]">
              <ReloadButton
                secondsLeft={secondsLeft}
                className="h-12 w-full rounded-xl text-[15px] font-semibold"
              />
              <p className="text-center text-[13px] text-muted-foreground">{footer}</p>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open>
      <DialogContent
        data-testid="reload-dialog"
        data-state={waiting ? 'waiting' : 'ready'}
        showCloseButton={false}
        overlayClassName="bg-[rgb(15_36_31/0.34)]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="gap-0 overflow-hidden rounded-2xl border-0 bg-card p-0 shadow-[0_30px_80px_rgb(15_36_31/0.35)] sm:max-w-[500px]"
      >
        <div className="grid gap-4 px-7 pt-7 pb-[22px]">
          <Tile waiting={waiting} />
          <div className="grid gap-2">
            <DialogTitle className="text-[21px] leading-[1.2] font-bold tracking-[-0.015em]">
              {title}
            </DialogTitle>
            <DialogDescription className="text-[15px] leading-[1.55] text-release-body">
              {description}
            </DialogDescription>
          </div>
          <KeptLine />
        </div>
        <div className="flex items-center gap-3 border-t border-muted bg-background/60 py-3.5 pr-5 pl-7">
          <p className="text-[13px] text-muted-foreground">{footer}</p>
          <ReloadButton
            secondsLeft={secondsLeft}
            className="ml-auto h-10 rounded-[10px] px-5 font-semibold tabular-nums"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
