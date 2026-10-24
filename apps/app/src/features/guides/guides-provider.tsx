import { useLocation, useNavigate } from '@tanstack/react-router';
import { lazy, type ReactNode, Suspense, useState } from 'react';

import { type Guide, guides, isGuideDue } from './guides';
import { GuidesContext } from './guides-context';
import { useGuideStates, useRecordGuide } from './use-guides';

// The tour library stays out of the first download: most page loads never show a guide. A tab
// left open across a deploy asks for a chunk that no longer exists; the page goes on without it.
const GuideTour = lazy(() =>
  import('./guide-tour').then(
    (module) => ({ default: module.GuideTour }),
    () => ({ default: () => null })
  )
);

// `holdBack` keeps a guide from starting by itself while something else opens over the page; a
// guide already showing goes on.
export function GuidesProvider({ holdBack, children }: { holdBack: boolean; children: ReactNode }) {
  const states = useGuideStates();
  const record = useRecordGuide();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [active, setActive] = useState<Guide | null>(null);
  const [lastPathname, setLastPathname] = useState(pathname);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (active && pathname !== active.path) setActive(null);
  }

  const seen = states.data?.items;
  const due =
    !active && seen && !holdBack
      ? guides.find((guide) => guide.path === pathname && isGuideDue(guide, seen))
      : undefined;
  if (due) setActive(due);

  const showing = active && active.path === pathname ? active : undefined;

  function startGuide(next: Guide) {
    setActive(next);
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
              setActive(null);
            }}
          />
        </Suspense>
      )}
    </GuidesContext>
  );
}
