import { useLocation, useNavigate } from '@tanstack/react-router';
import { lazy, type ReactNode, Suspense, useState } from 'react';

import { type Guide, guides, isGuideDue } from './guides';
import { GuidesContext } from './guides-context';
import { useGuideStates, useRecordGuide } from './use-guides';

// The tour library stays out of the first download: most page loads never show a guide.
const GuideTour = lazy(() =>
  import('./guide-tour').then((module) => ({ default: module.GuideTour }))
);

// `holdBack` keeps a guide from starting by itself, while something else opens over the page.
export function GuidesProvider({ holdBack, children }: { holdBack: boolean; children: ReactNode }) {
  const states = useGuideStates();
  const record = useRecordGuide();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [requested, setRequested] = useState<Guide | null>(null);

  const seen = states.data?.items;
  const due =
    seen && !holdBack
      ? guides.find((guide) => guide.path === pathname && isGuideDue(guide, seen))
      : undefined;
  const guide = requested ?? due;
  const showing = guide && guide.path === pathname ? guide : undefined;

  function startGuide(next: Guide) {
    setRequested(next);
    if (pathname !== next.path) void navigate({ to: next.path });
  }

  return (
    <GuidesContext value={{ startGuide }}>
      {children}
      {showing && (
        <Suspense fallback={null}>
          <GuideTour
            key={showing.id}
            guide={showing}
            onEnd={(status) => {
              record(showing, status);
              setRequested(null);
            }}
          />
        </Suspense>
      )}
    </GuidesContext>
  );
}
