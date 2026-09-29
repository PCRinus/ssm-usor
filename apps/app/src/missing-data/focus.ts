import { useNavigate } from '@tanstack/react-router';
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

export const clientDetailsFocus = [...legalRepresentativeFocus, ...companyFocus] as const;

export const trainingFocus = [
  'training-schedule',
  'workplace-manager',
  'first-aid',
  'risk-evaluation-team',
  'imminent-danger',
  'workers-representative',
  'workers-representative-clash',
] as const;

export const jobPositionsFocus = ['add-position'] as const;

export const documentsFocus = ['generate'] as const;

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
export type TrainingFocus = (typeof trainingFocus)[number];
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
const beat = 350;

// The middle of the window: an anchor near an edge is brought to the centre too, so the eye
// finds it before the dialog covers the page.
function atEase(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return bounds.top >= coveredTop && bounds.bottom <= window.innerHeight * 0.7;
}

// Waits for the smooth scroll to end before `then`, by watching where the element is: a page
// that has just rendered can start moving several frames late, and Safari has no `scrollend`.
// A beat follows even when nothing had to move: a dialog that opens with the page reads as
// the page failing to load. An element without a box, as in a test without layout, has
// nowhere to move and nobody to watch it.
function scrollThen(element: HTMLElement, then: () => void) {
  const laidOut = element.getClientRects().length > 0;
  const still = stillMotion();
  const moving = !atEase(element);
  if (moving || !laidOut) {
    element.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  }
  if (!laidOut) {
    then();
    return () => {};
  }
  let frame = 0;
  let pause: ReturnType<typeof setTimeout> | undefined;
  const afterBeat = () => {
    pause = setTimeout(then, beat);
  };
  if (moving && !still) {
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
      if (moved ? now - restingSince > settledAfter : now - started > startsWithin) {
        if (moved) afterBeat();
        else then();
        return;
      }
      if (now - started > movesAtMost) {
        then();
        return;
      }
      frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);
  } else {
    afterBeat();
  }
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
    if (!requested || !ready) return;
    return answer();
  }, [requested, ready]);
}
