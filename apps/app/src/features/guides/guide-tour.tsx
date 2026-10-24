import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { useEffect, useState } from 'react';
import { type EventHandler, EVENTS, STATUS, type Step, useJoyride } from 'react-joyride';

import type { GuideState } from '@/api/generated/api';
import { captureEvent } from '@/app/observability/posthog';

import { GuideTooltip } from './guide-tooltip';
import { type Guide, tourTarget } from './guides';

// Built once per guide and layout: the tour restarts when it is handed a new steps array.
const builtSteps = new WeakMap<Guide, { desktop: Step[]; phone: Step[] }>();

function stepsOf(guide: Guide, phone: boolean) {
  let built = builtSteps.get(guide);
  if (!built) {
    const build = (onPhone: boolean): Step[] =>
      guide.steps.map((step) => {
        const target = onPhone && step.phoneTarget !== undefined ? step.phoneTarget : step.target;
        return {
          id: `${guide.id}-${step.title}`,
          target: target ? tourTarget(target) : 'body',
          placement: target ? 'auto' : 'center',
          title: step.title,
          content: (onPhone && step.phoneBody) || step.body,
        };
      });
    built = { desktop: build(false), phone: build(true) };
    builtSteps.set(guide, built);
  }
  return phone ? built.phone : built.desktop;
}

const targetsPresent = (steps: Step[]) =>
  steps.every(
    (step) => typeof step.target !== 'string' || document.querySelector(step.target) !== null
  );

function useTargetsPresent(steps: Step[]) {
  const [present, setPresent] = useState(() => targetsPresent(steps));
  useEffect(() => {
    if (present) return;
    const check = () => {
      if (!targetsPresent(steps)) return;
      observer.disconnect();
      setPresent(true);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = requestAnimationFrame(check);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [present, steps]);
  return present;
}

const locale = {
  back: 'Înapoi',
  close: 'Închide',
  last: 'Gata',
  next: 'Următorul',
  skip: 'Sari peste',
};

export function GuideTour({
  guide,
  onEnd,
}: {
  guide: Guide;
  onEnd: (status: GuideState['status']) => void;
}) {
  const isMobile = useIsMobile();
  const [phone] = useState(isMobile);
  const steps = stepsOf(guide, phone);
  // Joyride does not start a tour whose run is set before its targets exist (its issue #1211).
  const run = useTargetsPresent(steps);
  const properties = (index: number) => ({
    guide: guide.id,
    version: guide.version,
    step: index + 1,
  });

  const onEvent: EventHandler = (data) => {
    if (data.type === EVENTS.TOUR_START) captureEvent('guide_started', properties(data.index));
    if (data.type !== EVENTS.TOUR_END) return;
    const status = data.status === STATUS.FINISHED ? 'completed' : 'skipped';
    captureEvent(
      status === 'completed' ? 'guide_completed' : 'guide_skipped',
      properties(data.index)
    );
    onEnd(status);
  };

  const { Tour, controls } = useJoyride({
    steps,
    run,
    continuous: true,
    onEvent,
    locale,
    tooltipComponent: GuideTooltip,
    floatingOptions: { hideArrow: true },
    options: {
      buttons: ['back', 'skip', 'primary'],
      // Escape skips, which Joyride's own key handling cannot do; see the listener below.
      dismissKeyAction: false,
      overlayClickAction: false,
      blockTargetInteraction: true,
      skipBeacon: true,
      overlayColor: 'rgb(15 36 31 / 0.45)',
      spotlightPadding: 4,
      spotlightRadius: 12,
      scrollOffset: 96,
      zIndex: 60,
    },
    styles: { floater: { filter: 'none' } },
  });

  useEffect(() => {
    if (!run) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      controls.skip('button_skip');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [run, controls]);

  return Tour;
}
