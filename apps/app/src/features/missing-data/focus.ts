import { documentTypeKeys, fireSafetyDocumentTypeKeys } from '@ssm-usor/contracts';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useEffectEvent } from 'react';
import { z } from 'zod';

// Each page accepts only its own keys: a key names a card or a dialog, and is never used as a
// selector, since anyone can put anything in an address.
export const legalRepresentativeFocus = [
  'legal-representative-name',
  'legal-representative-role',
] as const;

export const companyFocus = ['company-trade-register', 'company-address'] as const;

export const contractFocus = [
  'contract-details',
  'contract-representative-name',
  'contract-representative-role',
] as const;

export const workplacesFocus = ['add-workplace', 'workplace-fire-data'] as const;

export const clientDetailsFocus = [
  ...legalRepresentativeFocus,
  ...companyFocus,
  ...workplacesFocus,
] as const;

export const fireTrainingFocus = ['fire-training-schedule', 'fire-smoking', 'fire-waste'] as const;

export const responsiblePersonFocus = [
  'workplace-manager',
  'first-aid',
  'risk-evaluation-team',
  'imminent-danger',
  'workers-representative',
  'workers-representative-clash',
  'fire-safety-coordinator',
  'fire-intervention-leader',
] as const;

export const trainingFocus = [
  'training-schedule',
  ...fireTrainingFocus,
  ...responsiblePersonFocus,
] as const;

export const fireSafetyMeansFocus = ['fire-equipment'] as const;

export const jobPositionsFocus = ['add-position'] as const;

export const documentsFocus = ['generate'] as const;

export const occupationalSafetyDocumentsFocus = [...documentsFocus, ...documentTypeKeys] as const;

export const fireSafetyDocumentsFocus = [...documentsFocus, ...fireSafetyDocumentTypeKeys] as const;

export const clientContractFocus = ['contract-details'] as const;

export const leadFocus = [...companyFocus, ...contractFocus] as const;

export const organizationCompanyFocus = [
  'legal-name',
  'cui',
  'trade-register',
  'address',
  'representative-name',
  'representative-role',
  'phone',
  'bank-account',
] as const;

export const authorizationsFocus = ['certificate', 'fire-safety-technician'] as const;

export const profileFocus = ['full-name', 'professional-title'] as const;

export type LegalRepresentativeFocus = (typeof legalRepresentativeFocus)[number];
export type CompanyFocus = (typeof companyFocus)[number];
export type ContractFocus = (typeof contractFocus)[number];
export type ClientDetailsFocus = (typeof clientDetailsFocus)[number];
export type WorkplacesFocus = (typeof workplacesFocus)[number];
export type TrainingFocus = (typeof trainingFocus)[number];
export type FireTrainingFocus = (typeof fireTrainingFocus)[number];
export type ResponsiblePersonFocus = (typeof responsiblePersonFocus)[number];
export type OrganizationCompanyFocus = (typeof organizationCompanyFocus)[number];
export type AuthorizationsFocus = (typeof authorizationsFocus)[number];
export type ProfileFocus = (typeof profileFocus)[number];

// A stale or hand-edited key still opens the page.
export function focusSearch<const Keys extends readonly [string, ...string[]]>(keys: Keys) {
  return z.object({ focus: z.enum(keys).optional().catch(undefined) });
}

export function focusAmong<const Key extends string>(
  focus: string | undefined,
  keys: readonly Key[]
): Key | undefined {
  return keys.find((key) => key === focus);
}

const lookFor = 10_000;

// The sticky app header and a record's tab bar, as the cards' scroll-mt-32 clears them.
const coveredTop = 128;

const stillMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function inView(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return bounds.top >= coveredTop && bounds.bottom <= window.innerHeight;
}

function whenPresent(id: string, found: (element: HTMLElement) => void, gaveUp: () => void) {
  const started = performance.now();
  let frame = 0;
  const look = () => {
    const element = document.getElementById(id);
    if (element) found(element);
    else if (performance.now() - started > lookFor) gaveUp();
    else frame = requestAnimationFrame(look);
  };
  frame = requestAnimationFrame(look);
  return () => cancelAnimationFrame(frame);
}

const settledAfter = 120;
const startsWithin = 400;
const movesAtMost = 1500;
const beat = 600;
const pointedFor = 2700;
const tries = 3;
const centred = 24;

// Styled in styles.css. It says which button or field the row was about, also on a page too
// short to scroll.
function point(element: HTMLElement) {
  element.setAttribute('data-pointed', '');
  setTimeout(() => element.removeAttribute('data-pointed'), pointedFor);
}

function offCentre(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return (bounds.top + bounds.bottom) / 2 - window.innerHeight / 2;
}

function canMoveTo(element: HTMLElement) {
  const page = document.scrollingElement;
  const by = offCentre(element);
  if (!page || Math.abs(by) <= centred) return false;
  return by > 0 ? page.scrollTop < page.scrollHeight - page.clientHeight - 1 : page.scrollTop > 0;
}

// Brings the element as near the middle of the window as the page allows, points at it, and
// calls `then` a beat later. It watches where the element is rather than the scroll events:
// Safari has no `scrollend`, and the router's own scroll to the top, or a card that loads
// above, can undo a scroll that started too early, which is why it tries again. An element
// without a box, as in a test without layout, has nowhere to move and nobody to watch it.
function scrollThen(element: HTMLElement, then: () => void) {
  const still = stillMotion();
  const scroll = () =>
    element.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  if (element.getClientRects().length === 0) {
    scroll();
    then();
    return () => {};
  }
  let frame = 0;
  let pause: ReturnType<typeof setTimeout> | undefined;
  let tried = 0;
  const arrive = () => {
    point(element);
    pause = setTimeout(then, beat);
  };
  const move = () => {
    if (tried >= tries || !canMoveTo(element)) {
      arrive();
      return;
    }
    tried += 1;
    scroll();
    if (still) {
      arrive();
      return;
    }
    const started = performance.now();
    let top = element.getBoundingClientRect().top;
    let restingSince = started;
    let moved = false;
    const watch = () => {
      const now = performance.now();
      const current = element.getBoundingClientRect().top;
      if (current !== top) {
        top = current;
        restingSince = now;
        moved = true;
      }
      if (now - started > movesAtMost) arrive();
      else if (moved ? now - restingSince > settledAfter : now - started > startsWithin) move();
      else frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);
  };
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(move);
  });
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(pause);
  };
}

function focusField(element: HTMLElement) {
  if (!inView(element)) {
    element.scrollIntoView({ block: 'center', behavior: stillMotion() ? 'auto' : 'smooth' });
  }
  element.focus({ preventScroll: true });
  point(element);
}

// The page first scrolls to `anchor`, the button that opens the dialog or the card's form, and
// opens it only once still, so nothing changes size while the page moves. The key then leaves
// the address with a replace, so a reload or the back button does not open it again.
export function useFocusRequest(
  requested: boolean,
  {
    ready = true,
    anchor,
    open,
    field,
  }: {
    ready?: boolean;
    anchor?: () => HTMLElement | null;
    open?: () => void;
    field?: string;
  }
) {
  const navigate = useNavigate();
  // The router scrolls to the top when a page opens; the request waits for that to be over.
  const arrived = useRouterState({ select: (state) => state.status === 'idle' });
  const answer = useEffectEvent(() => {
    const done = () =>
      void navigate({
        to: '.',
        search: ((previous: Record<string, unknown>) => ({
          ...previous,
          focus: undefined,
        })) as never,
        hash: true,
        replace: true,
        resetScroll: false,
      });
    let stopLooking = () => {};
    const afterOpening = () => {
      open?.();
      if (!field) {
        done();
        return;
      }
      stopLooking = whenPresent(
        field,
        (element) => {
          focusField(element);
          done();
        },
        done
      );
    };
    const target = open ? anchor?.() : null;
    const stopScrolling = target ? scrollThen(target, afterOpening) : (afterOpening(), () => {});
    return () => {
      stopScrolling();
      stopLooking();
    };
  });

  useEffect(() => {
    if (!requested || !ready || !arrived) return;
    return answer();
  }, [requested, ready, arrived]);
}
