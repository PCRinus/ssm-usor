import type { Toaster } from '@ssm-usor/ui/components/sonner';
import { type ComponentProps, useSyncExternalStore } from 'react';

import type { GuideView } from './guide-storage';

interface GuideFootprint {
  view: GuideView;
  phone: boolean;
}

let footprint: GuideFootprint | null = null;
const listeners = new Set<() => void>();

export function setGuideFootprint(next: GuideFootprint | null) {
  if (next?.view === footprint?.view && next?.phone === footprint?.phone) return;
  footprint = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getFootprint = () => footprint;

const guideInset = 24;
const gap = 16;
const width: Record<GuideView, number> = { expanded: 372, collapsed: 340 };
const aboveBar = 'calc(9.5rem + env(safe-area-inset-bottom, 0px))';

export function useToasterOffset(): Pick<
  ComponentProps<typeof Toaster>,
  'offset' | 'mobileOffset'
> {
  const current = useSyncExternalStore(subscribe, getFootprint, getFootprint);
  if (!current) return {};
  if (!current.phone) return { offset: { right: guideInset + width[current.view] + gap } };
  // The sheet dims the page under it, so a toast may cover it.
  if (current.view === 'expanded') return {};
  // Sonner's mobile layout starts at 600 px and the app's phone layout at 768 px.
  return { offset: { bottom: aboveBar }, mobileOffset: { bottom: aboveBar } };
}
