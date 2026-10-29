import type { SetupStepId } from '@ssm-usor/contracts';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { SetupGuide, SetupStep } from '@/api/generated/api';
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
import {
  type GuideFocusTarget,
  type GuideHiddenReason,
  SetupGuideContext,
  type SetupGuideControls,
} from './setup-guide-context';
import { countsAsDone, isComplete } from './steps';
import { setGuideFootprint } from './toast-offset';
import { setupGuideQueryKey, useSetupGuideChanges, useSetupGuideQuery } from './use-setup-guide';

const settingsPath = '/setari';

// `holdBack`: the guide never overlaps the update dialog (ADR 031).
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
  const pathname = useLocation({ select: (location) => location.pathname });
  // A platform admin acting as an owner would close or skip on their own account.
  const hiddenBecause: GuideHiddenReason | null = me.data?.impersonation
    ? 'impersonation'
    : me.data?.subscription?.access === 'read_only'
      ? 'read-only'
      : null;
  const query = useSetupGuideQuery(
    Boolean(membership) && (!hiddenBecause || pathname === settingsPath)
  );
  const changes = useSetupGuideChanges();
  const phone = useIsMobile();
  const queryClient = useQueryClient();
  const guide = query.data ?? undefined;

  const doneCount = guide?.steps.filter(countsAsDone).length ?? 0;
  const complete = Boolean(guide && isComplete(guide.steps));

  const hidden = editorPage || !membership || Boolean(hiddenBecause) || !guide || guide.finished;

  const storedChoice = () => {
    const stored = userId ? readGuideView(userId) : null;
    return { userId, view: phone && stored === 'expanded' ? 'collapsed' : stored };
  };
  const [chosen, setChosen] = useState<{ userId?: string; view: GuideView | null }>(storedChoice);
  if (chosen.userId !== userId) setChosen(storedChoice());

  const [sawComplete, setSawComplete] = useState<boolean | undefined>(undefined);
  if (guide && sawComplete !== complete) {
    setSawComplete(complete);
    if (complete && sawComplete === false) setChosen({ userId, view: 'expanded' });
  }

  const waiting = holdBack || hidden;
  const pill = Boolean(guide?.closed && !complete);
  if (!waiting && userId && guide && !pill && chosen.view === null) {
    const view: GuideView =
      complete || (!phone && !wasOpenedHere(userId)) ? 'expanded' : 'collapsed';
    setChosen({ userId, view });
  }

  // A guide closed to the pill opens once by itself to say Gata (ADR 031).
  const view: SetupGuideControls['view'] =
    waiting || !guide ? null : pill ? 'closed' : guide.closed ? 'expanded' : chosen.view;

  useEffect(() => {
    if (!userId || !chosen.view) return;
    saveGuideView(userId, chosen.view);
    markOpenedHere(userId);
  }, [userId, chosen.view]);

  useEffect(() => {
    setGuideFootprint(view === 'expanded' || view === 'collapsed' ? { view, phone } : null);
  }, [view, phone]);
  useEffect(() => () => setGuideFootprint(null), []);

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

  const refetchOnRoute = !guide?.finished || pathname === settingsPath;
  useEffect(() => {
    if (!refetchOnRoute) return;
    void queryClient.refetchQueries({
      queryKey: setupGuideQueryKey(userId),
      stale: true,
      type: 'active',
    });
  }, [pathname, queryClient, userId, refetchOnRoute]);

  const [focusRequest, setFocusRequest] = useState<GuideFocusTarget | null>(null);
  const focusAfterStepChange = (next: SetupGuide) =>
    setFocusRequest(next.next ? 'next' : 'heading');

  const setView = (next: GuideView) => setChosen({ userId, view: next });
  const finish = () => {
    void changes.record(guide?.closed ? { closed: false, finished: true } : { finished: true });
    captureEvent('setup_guide_finished', {});
  };

  const controls: SetupGuideControls = {
    guide,
    isPending: query.isPending,
    isError: query.isError || query.data === null,
    retry: () => void query.refetch(),
    doneCount,
    complete,
    view,
    hiddenBecause,
    phone,
    isOwner: membership?.role === 'owner',
    pendingStep: changes.pendingStep,
    focusRequest,
    focusHandled: () => setFocusRequest(null),
    expand: () => {
      setView('expanded');
      setFocusRequest('collapse');
      captureEvent('setup_guide_expanded', {});
    },
    collapse: () => {
      if (complete) return finish();
      setView('collapsed');
      setFocusRequest('expand');
      captureEvent('setup_guide_collapsed', {});
    },
    close: () => {
      if (complete) return finish();
      void changes.record({ closed: true });
      setFocusRequest('header-button');
      captureEvent('setup_guide_closed', {});
    },
    reopen: (from) => {
      void changes.record(
        from === 'settings' ? { closed: false, finished: false } : { closed: false }
      );
      setView('collapsed');
      if (from === 'pill') setFocusRequest('expand');
      captureEvent('setup_guide_reopened', { from });
    },
    skip: (step) => {
      void changes.skip(step, focusAfterStepChange);
      captureEvent('setup_step_skipped', { step });
    },
    unskip: (step) => {
      void changes.unskip(step, focusAfterStepChange);
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
