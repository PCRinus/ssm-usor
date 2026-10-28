import type { SetupStepId } from '@ssm-usor/contracts';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { SetupStep } from '@/api/generated/api';
import { captureEvent } from '@/app/observability/posthog';
import { useMe } from '@/features/account/use-me';
import { useAuth } from '@/features/auth/auth-context';

import {
  type GuideView,
  markOpenedHere,
  readGuideView,
  saveGuideView,
  wasOpenedHere,
} from './guide-storage';
import { SetupGuideContext, type SetupGuideControls } from './setup-guide-context';
import { countsAsDone } from './steps';
import { setupGuideQueryKey, useSetupGuideChanges, useSetupGuideQuery } from './use-setup-guide';

// `holdBack` keeps the guide off the page while the update dialog loads or shows, so the two
// never overlap.
export function SetupGuideProvider({
  editorPage,
  holdBack,
  children,
}: {
  editorPage: boolean;
  holdBack: boolean;
  children: ReactNode;
}) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const me = useMe();
  const membership = me.data?.membership;
  const query = useSetupGuideQuery(Boolean(membership));
  const changes = useSetupGuideChanges();
  const phone = useIsMobile();
  const queryClient = useQueryClient();
  const pathname = useLocation({ select: (location) => location.pathname });
  const guide = query.data ?? undefined;

  const doneCount = guide?.steps.filter(countsAsDone).length ?? 0;
  const allDone = Boolean(guide && doneCount === guide.steps.length);

  // A platform admin acting as an owner would close or skip on their own account.
  const hidden =
    editorPage ||
    !membership ||
    me.data?.subscription?.access === 'read_only' ||
    Boolean(me.data?.impersonation) ||
    !guide ||
    guide.finished;

  const storedChoice = () => {
    const stored = userId ? readGuideView(userId) : null;
    return { userId, view: phone && stored === 'expanded' ? 'collapsed' : stored };
  };
  const [chosen, setChosen] = useState<{ userId?: string; view: GuideView | null }>(storedChoice);
  if (chosen.userId !== userId) setChosen(storedChoice());

  const [sawAllDone, setSawAllDone] = useState<boolean | undefined>(undefined);
  if (guide && sawAllDone !== allDone) {
    setSawAllDone(allDone);
    if (allDone && sawAllDone === false) setChosen({ userId, view: 'expanded' });
  }

  const waiting = holdBack || hidden;
  if (!waiting && userId && guide && !guide.closed && chosen.view === null) {
    const view: GuideView =
      allDone || (!phone && !wasOpenedHere(userId)) ? 'expanded' : 'collapsed';
    setChosen({ userId, view });
  }

  useEffect(() => {
    if (!userId || !chosen.view) return;
    saveGuideView(userId, chosen.view);
    markOpenedHere(userId);
  }, [userId, chosen.view]);

  const previous = useRef<Map<SetupStepId, SetupStep['state']>>(null);
  useEffect(() => {
    if (!guide) return;
    const before = previous.current;
    for (const step of guide.steps) {
      const was = before?.get(step.id);
      if (step.state === 'done' && was && was !== 'done') {
        captureEvent('setup_step_done', { step: step.id });
      }
    }
    previous.current = new Map(guide.steps.map((step) => [step.id, step.state]));
  }, [guide]);

  useEffect(() => {
    void queryClient.refetchQueries({
      queryKey: setupGuideQueryKey(userId),
      stale: true,
      type: 'active',
    });
  }, [pathname, queryClient, userId]);

  const setView = (view: GuideView) => setChosen({ userId, view });
  const finish = () => {
    changes.record({ finished: true });
    captureEvent('setup_guide_finished', {});
  };

  const controls: SetupGuideControls = {
    guide,
    isPending: query.isPending,
    isError: query.isError || query.data === null,
    retry: () => void query.refetch(),
    doneCount,
    allDone,
    view: waiting || !guide ? null : guide.closed ? 'closed' : chosen.view,
    phone,
    isOwner: membership?.role === 'owner',
    pendingStep: changes.pendingStep,
    expand: () => {
      setView('expanded');
      captureEvent('setup_guide_expanded', {});
    },
    collapse: () => {
      if (allDone) return finish();
      setView('collapsed');
      captureEvent('setup_guide_collapsed', {});
    },
    close: () => {
      if (allDone) return finish();
      changes.record({ closed: true });
      captureEvent('setup_guide_closed', {});
    },
    reopen: (from) => {
      changes.record(from === 'settings' ? { closed: false, finished: false } : { closed: false });
      setView('collapsed');
      captureEvent('setup_guide_reopened', { from });
    },
    skip: (step) => {
      changes.skip(step);
      captureEvent('setup_step_skipped', { step });
    },
    unskip: (step) => {
      changes.unskip(step);
      captureEvent('setup_step_unskipped', { step });
    },
    follow: (step, action) => {
      captureEvent('setup_step_clicked', { step, action });
      // The sheet covers the page the link opens.
      if (phone && chosen.view === 'expanded') setView('collapsed');
    },
  };

  return <SetupGuideContext value={controls}>{children}</SetupGuideContext>;
}
