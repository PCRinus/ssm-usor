import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@ssm-usor/ui/components/drawer';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { TrendingUp, Wrench, X } from 'lucide-react';
import { lazy, type ReactNode, Suspense } from 'react';

import type { Release } from '@/api/generated/api';

import { saveDismissedTag } from './dismissal';
import { InlineMarkdown } from './inline-markdown';
import { KindSquare } from './kind-square';
import { dialogHighlights, formatReleaseDay, kindTitles, type ReleaseKind } from './release-format';
import { ReleaseTag } from './release-tag';
import { useAcknowledgeReleases, useReleases } from './use-releases';
import { useUpdateDialogOpen } from './use-update-dialog-open';

// Lazy: `lucide-react/dynamic` carries the import map of every lucide icon.
const FeatureIcon = lazy(() =>
  import('./feature-icon').then((module) => ({ default: module.FeatureIcon }))
);

const tiles: Record<ReleaseKind, string> = {
  features: 'bg-success text-success-foreground',
  improvements: 'bg-info text-info-foreground',
  fixes: 'bg-warning text-warning-foreground',
};

function Group({ kind, children }: { kind: ReleaseKind; children: ReactNode }) {
  return (
    <div className="grid gap-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
        <KindSquare kind={kind} />
        {kindTitles[kind]}
      </h3>
      <ul className="grid gap-3">{children}</ul>
    </div>
  );
}

function Tile({
  kind,
  phone,
  children,
}: {
  kind: ReleaseKind;
  phone: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        phone ? 'size-8 rounded-[9px]' : 'size-[34px] rounded-[10px]',
        tiles[kind]
      )}
    >
      {children}
    </span>
  );
}

function Highlights({ release, phone }: { release: Release; phone: boolean }) {
  const { features, improvements, fixes } = dialogHighlights(release);
  const icon = phone ? 'size-4' : 'size-[18px]';
  const lines = [
    { kind: 'improvements' as const, items: improvements, Icon: TrendingUp },
    { kind: 'fixes' as const, items: fixes, Icon: Wrench },
  ].filter(({ items }) => items.length > 0);
  return (
    <div className={phone ? 'grid gap-4' : 'grid gap-5'} data-testid="update-dialog-highlights">
      {features.length > 0 && (
        <Group kind="features">
          {features.map((feature) => {
            // The headline of a one-feature release is usually that feature's title.
            const titled = feature.title !== release.headline;
            return (
              <li
                key={feature.title}
                className={cn('flex gap-3.5', titled && phone ? 'items-center' : 'items-start')}
              >
                <Tile kind="features" phone={phone}>
                  <Suspense fallback={<span className={icon} />}>
                    <FeatureIcon name={feature.icon} className={icon} />
                  </Suspense>
                </Tile>
                {titled ? (
                  <span className="grid gap-0.5">
                    <span className="text-sm font-semibold">
                      <InlineMarkdown text={feature.title} />
                    </span>
                    {!phone && (
                      <span className="text-[13px] leading-[1.45] text-muted-foreground">
                        <InlineMarkdown text={feature.text} />
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-[15px] leading-normal text-release-body">
                    <InlineMarkdown text={feature.text} />
                  </span>
                )}
              </li>
            );
          })}
        </Group>
      )}
      {lines.map(({ kind, items, Icon }) => (
        <Group key={kind} kind={kind}>
          {items.map((line) => (
            <li key={line} className="flex items-center gap-3.5 text-sm">
              <Tile kind={kind} phone={phone}>
                <Icon aria-hidden="true" className={icon} />
              </Tile>
              <span>
                <InlineMarkdown text={line} />
              </span>
            </li>
          ))}
        </Group>
      ))}
    </div>
  );
}

function MoreCount({ release }: { release: Release }) {
  const { rest } = dialogHighlights(release);
  if (!rest) return null;
  return (
    <span data-testid="update-dialog-more" className="text-[13px] text-muted-foreground">
      {rest}
    </span>
  );
}

export function UpdateDialog() {
  const { newestUnread: release } = useReleases();
  const { acknowledge } = useAcknowledgeReleases();
  const phone = useIsMobile();
  const open = useUpdateDialogOpen();

  if (!release) return null;

  function dismiss() {
    if (!release) return;
    saveDismissedTag(release.tag);
  }

  function understood() {
    dismiss();
    acknowledge();
  }

  const onOpenChange = (next: boolean) => {
    if (!next) dismiss();
  };
  const published = formatReleaseDay(release.publishedAt);
  const details = (
    <Link to="/actualizari/$tag" params={{ tag: release.tag }} onClick={dismiss}>
      Vezi detaliile
    </Link>
  );

  if (phone) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          data-testid="update-dialog"
          className="h-auto max-h-[92dvh] bg-release-sand [&>[data-slot=drawer-handle]]:bg-foreground/25"
        >
          <div className="relative flex shrink-0 items-end gap-[18px] px-5 pt-3.5">
            <ReleaseTag tag={release.tag} size="sheet" />
            <div className="grid gap-1 pb-[18px]">
              <span className="text-[22px] leading-none font-bold tracking-[-0.01em] tabular-nums">
                {release.tag}
              </span>
              <span className="text-[13px] text-release-sand-muted">
                Versiune nouă, {published}
              </span>
            </div>
            <DrawerClose
              aria-label="Închide"
              className="absolute top-1.5 right-2 flex size-11 items-center justify-center rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="size-5" />
            </DrawerClose>
          </div>
          <DrawerBody
            data-testid="update-dialog-scroll"
            className="grid gap-4 bg-card px-5 pt-[22px] pb-4"
          >
            <div className="grid gap-2">
              <DrawerTitle className="text-[22px] leading-[1.2] font-bold tracking-[-0.015em]">
                <InlineMarkdown text={release.headline} />
              </DrawerTitle>
              {release.lead && (
                <DrawerDescription className="text-[15px] leading-normal text-release-body">
                  <InlineMarkdown text={release.lead} />
                </DrawerDescription>
              )}
            </div>
            <Highlights release={release} phone />
          </DrawerBody>
          <div className="grid shrink-0 gap-4 border-t border-muted bg-card px-5 pt-4 pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))]">
            <MoreCount release={release} />
            <div className="grid gap-2">
              <Button
                data-testid="update-dialog-acknowledge"
                className="h-12 rounded-xl text-[15px] font-semibold"
                onClick={understood}
              >
                Am înțeles
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-xl text-[15px]">
                {details}
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="update-dialog"
        showCloseButton={false}
        {...(release.lead ? {} : { 'aria-describedby': undefined })}
        className="flex max-h-[calc(100svh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] gap-0 overflow-hidden rounded-2xl border-0 bg-card p-0 shadow-[0_30px_80px_rgb(15_36_31/0.35)] sm:max-w-[740px]"
      >
        <div className="flex w-[228px] shrink-0 flex-col items-center bg-release-sand px-6">
          <div
            aria-hidden="true"
            className="min-h-8 flex-1 border-l-[1.5px] border-dashed border-release-ring"
          />
          <ReleaseTag tag={release.tag} size="dialog" label />
          <div className="grid gap-0.5 pt-12 text-center">
            <span className="text-sm font-semibold">Versiune nouă</span>
            <span className="text-[13px] text-release-sand-muted">publicată pe {published}</span>
          </div>
          <div aria-hidden="true" className="min-h-7 flex-1" />
        </div>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <DialogClose
            aria-label="Închide"
            className="absolute top-3.5 right-3.5 flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="size-[18px]" />
          </DialogClose>
          <div className="grid shrink-0 gap-2.5 pt-[30px] pr-16 pb-[22px] pl-8">
            <DialogTitle className="text-2xl leading-[1.2] font-bold tracking-[-0.015em]">
              <InlineMarkdown text={release.headline} />
            </DialogTitle>
            {release.lead && (
              <DialogDescription className="text-[15px] leading-[1.55] text-release-body">
                <InlineMarkdown text={release.lead} />
              </DialogDescription>
            )}
          </div>
          <div
            data-testid="update-dialog-scroll"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 pb-[26px]"
          >
            <Highlights release={release} phone={false} />
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-muted bg-background/60 py-4 pr-5 pl-8">
            <MoreCount release={release} />
            <Button asChild variant="outline" className="ml-auto h-10 rounded-[10px] px-4">
              {details}
            </Button>
            <Button
              data-testid="update-dialog-acknowledge"
              className="h-10 rounded-[10px] px-5 font-semibold"
              onClick={understood}
            >
              Am înțeles
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
