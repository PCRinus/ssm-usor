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
import { Link, useLocation } from '@tanstack/react-router';
import { Check, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import type { Release } from '@/api/generated/api';

import { readDismissedTag, saveDismissedTag } from './dismissal';
import { dialogHighlights, formatReleaseDay, improvementCount } from './release-format';
import { ReleaseTag } from './release-tag';
import { useAcknowledgeReleases, useReleases } from './use-releases';

// Lazy: `lucide-react/dynamic` carries the import map of every lucide icon.
const FeatureIcon = lazy(() =>
  import('./feature-icon').then((module) => ({ default: module.FeatureIcon }))
);

function Highlights({ release, phone }: { release: Release; phone: boolean }) {
  const { features, lines } = dialogHighlights(release);
  const square = phone ? 'size-8 rounded-[9px]' : 'size-9 rounded-[10px]';
  const icon = phone ? 'size-4' : 'size-[18px]';
  const fallback = <span className={icon} />;
  return (
    <ul className={phone ? 'grid gap-2.5' : 'grid gap-3.5'} data-testid="update-dialog-highlights">
      {features.map((feature) => (
        <li
          key={feature.title}
          className={phone ? 'flex items-center gap-3 text-sm' : 'flex items-start gap-3.5'}
        >
          <span className={`flex shrink-0 items-center justify-center bg-muted ${square}`}>
            <Suspense fallback={fallback}>
              <FeatureIcon name={feature.icon} className={icon} />
            </Suspense>
          </span>
          {phone ? (
            <span>{feature.title}</span>
          ) : (
            <span className="grid gap-0.5 pt-px">
              <span className="text-sm font-semibold">{feature.title}</span>
              <span className="text-[13px] leading-[1.45] text-muted-foreground">
                {feature.text}
              </span>
            </span>
          )}
        </li>
      ))}
      {lines.map((line) => (
        <li
          key={line}
          className={
            phone ? 'flex items-center gap-3 text-sm' : 'flex items-center gap-3.5 text-sm'
          }
        >
          <span className={`flex shrink-0 items-center justify-center bg-muted ${square}`}>
            <Check aria-hidden="true" className={icon} />
          </span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function MoreCount({ release }: { release: Release }) {
  const { more } = dialogHighlights(release);
  if (more === 0) return null;
  return (
    <span data-testid="update-dialog-more" className="ml-auto text-[13px] text-muted-foreground">
      și încă {improvementCount(more)}
    </span>
  );
}

export function UpdateDialog() {
  const { newestUnread: release } = useReleases();
  const { acknowledge } = useAcknowledgeReleases();
  const phone = useIsMobile();
  const [dismissed, setDismissed] = useState(readDismissedTag);
  // A link to a release page lands on what the dialog would show, and that page acknowledges.
  const onUpdatesPage = useLocation({
    select: (location) =>
      location.pathname === '/actualizari' || location.pathname.startsWith('/actualizari/'),
  });
  const open = Boolean(release) && release?.tag !== dismissed && !onUpdatesPage;

  if (!release) return null;

  function dismiss() {
    if (!release) return;
    saveDismissedTag(release.tag);
    setDismissed(release.tag);
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
          <div className="relative flex items-end gap-[18px] px-5 pt-3.5">
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
          <DrawerBody className="grid gap-4 bg-card px-5 pt-[22px] pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))]">
            <div className="grid gap-2">
              <DrawerTitle className="text-[22px] leading-[1.2] font-bold tracking-[-0.015em]">
                {release.headline}
              </DrawerTitle>
              {release.lead && (
                <DrawerDescription className="text-[15px] leading-normal text-release-body">
                  {release.lead}
                </DrawerDescription>
              )}
            </div>
            <Highlights release={release} phone />
            <div className="grid gap-2 pt-1">
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
          </DrawerBody>
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
        className="flex gap-0 overflow-hidden rounded-2xl border-0 bg-card p-0 shadow-[0_30px_80px_rgb(15_36_31/0.35)] sm:max-w-[700px]"
      >
        <div className="flex w-[228px] shrink-0 flex-col items-center bg-release-sand px-6 pb-7">
          <div
            aria-hidden="true"
            className="min-h-8 flex-3 border-l-[1.5px] border-dashed border-release-ring"
          />
          <ReleaseTag tag={release.tag} size="dialog" label />
          <div aria-hidden="true" className="min-h-[22px] flex-1" />
          <div className="grid gap-0.5 text-center">
            <span className="text-sm font-semibold">Versiune nouă</span>
            <span className="text-[13px] text-release-sand-muted">publicată pe {published}</span>
          </div>
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col gap-5 pt-7 pr-7 pb-6 pl-8">
          <DialogClose
            aria-label="Închide"
            className="absolute top-3.5 right-3.5 flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="size-[18px]" />
          </DialogClose>
          <div className="grid gap-2.5 pr-8">
            <DialogTitle className="text-2xl leading-[1.2] font-bold tracking-[-0.015em]">
              {release.headline}
            </DialogTitle>
            {release.lead && (
              <DialogDescription className="text-[15px] leading-[1.55] text-release-body">
                {release.lead}
              </DialogDescription>
            )}
          </div>
          <Highlights release={release} phone={false} />
          <div className="flex items-center gap-2 pt-1">
            <Button
              data-testid="update-dialog-acknowledge"
              className="h-10 rounded-[10px] px-5 font-semibold"
              onClick={understood}
            >
              Am înțeles
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-[10px] px-4">
              {details}
            </Button>
            <MoreCount release={release} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
