import type { PostHog } from 'posthog-js';

type Properties = Record<string, string | number | boolean>;

const token = import.meta.env.PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
const siteHost = new URL(import.meta.env.SITE).hostname;
const preferenceKey = 'ssmusor-analytics';

let client: PostHog | undefined;
let stopped = false;
const pending: Array<[string, Properties]> = [];

export function track(event: string, properties: Properties = {}) {
  if (stopped) return;
  if (client) client.capture(event, properties, { send_instantly: true });
  else pending.push([event, properties]);
}

// Cookieless mode leaves PostHog nothing to filter the owner's own visits on, so the site keeps
// the choice itself: `?analytics=off`, `?analytics=on` (a local build with a token), `?analytics=auto`.
function preference(): 'on' | 'off' | undefined {
  try {
    const wanted = new URLSearchParams(location.search).get('analytics');
    if (wanted === 'on' || wanted === 'off') localStorage.setItem(preferenceKey, wanted);
    else if (wanted === 'auto') localStorage.removeItem(preferenceKey);
    const stored = localStorage.getItem(preferenceKey);
    return stored === 'on' || stored === 'off' ? stored : undefined;
  } catch {
    return undefined;
  }
}

function enabled(): boolean {
  if (!token) return false;
  const choice = preference();
  if (choice) return choice === 'on';
  return location.hostname === siteHost;
}

async function load() {
  try {
    const { default: posthog } = await import('posthog-js');
    posthog.init(token!, {
      // PostHog's managed proxy on our domain, as in the app: Firefox's tracking protection
      // blocks PostHog's own hosts.
      api_host: 'https://e.ssmusor.ro',
      ui_host: 'https://eu.posthog.com',
      defaults: '2026-05-30',
      // Nothing is stored in the browser; the project setting "Cookieless server hash mode"
      // must be on, or these events are dropped.
      cookieless_mode: 'always',
      person_profiles: 'never',
      autocapture: false,
      rageclick: false,
      capture_pageview: true,
      capture_pageleave: true,
      capture_performance: { web_vitals: true, network_timing: false },
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
    });
    client = posthog;
    for (const [event, properties] of pending.splice(0)) track(event, properties);
  } catch {
    stopped = true;
    pending.length = 0;
  }
}

function properties(element: HTMLElement): Properties {
  const result: Properties = {};
  for (const [key, value] of Object.entries(element.dataset)) {
    if (key.startsWith('trackProp') && value !== undefined) {
      const name = key.slice('trackProp'.length);
      result[name.charAt(0).toLowerCase() + name.slice(1)] = value;
    }
  }
  return result;
}

function watchPage() {
  for (const element of document.querySelectorAll<HTMLElement>('[data-track-view]')) {
    track(element.dataset.trackView!, properties(element));
  }

  document.addEventListener('click', (event) => {
    const element = (event.target as Element).closest<HTMLElement>('[data-track]');
    if (element) track(element.dataset.track!, properties(element));
  });

  document.addEventListener(
    'toggle',
    (event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      const question = details.querySelector('summary')?.textContent?.trim();
      if (question) track('faq_opened', { question });
    },
    true
  );

  const sections = document.querySelectorAll<HTMLElement>('main section[id]');
  if (sections.length === 0 || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        track('section_viewed', { section: entry.target.id });
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.35 }
  );
  sections.forEach((section) => observer.observe(section));
}

export function startAnalytics() {
  if (!enabled()) {
    stopped = true;
    return;
  }
  watchPage();
  // After the page settles: the bundle is not worth a slower first paint.
  const start = () => void load();
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 });
  else setTimeout(start, 300);
}
