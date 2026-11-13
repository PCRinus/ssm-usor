import type { PostHog } from 'posthog-js';
import { z } from 'zod';

import { maskReplayInput, maskReplayText } from './replay-masking';

let clientPromise: Promise<PostHog | null> | null = null;

const textAttributes = new Set([
  'title',
  'alt',
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'aria-placeholder',
  'placeholder',
  'label',
  'value',
  'data-value',
  'download',
  'srcdoc',
]);

const everyInputType = Object.fromEntries(
  [
    'color',
    'date',
    'datetime-local',
    'email',
    'file',
    'month',
    'number',
    'password',
    'range',
    'search',
    'select',
    'tel',
    'text',
    'textarea',
    'time',
    'url',
    'week',
  ].map((type) => [type, true])
);

const addressAttributes = new Set(['href', 'src']);

function isSameOrigin(address: string) {
  try {
    return new URL(address, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

// Replays keep `class` and `style`, or they play as bare HTML. A link to another origin can
// carry a signed file address and the file's name, so only the app's own addresses stay.
export function maskReplayAttribute(name: string, value: string, element?: Element) {
  // A field's value reaches this already through maskInputFn, which keeps the shown fields.
  if (name === 'value' && element?.matches('input, textarea, select')) {
    return maskReplayInput(value, element);
  }
  const masked = textAttributes.has(name) || (addressAttributes.has(name) && !isSameOrigin(value));
  return masked ? '*'.repeat(value.length) : value;
}

export function loadPostHog(): Promise<PostHog | null> {
  const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) return Promise.resolve(null);

  clientPromise ??= Promise.all([
    import('posthog-js'),
    // Content blockers refuse the scripts PostHog would fetch from /static/, and the SDK fetches
    // none whose code is already defined.
    import('posthog-js/dist/posthog-recorder'),
    import('posthog-js/dist/exception-autocapture'),
    import('posthog-js/dist/web-vitals-with-attribution'),
    import('posthog-js/dist/conversations'),
  ])
    .then(([{ default: posthog }]) => {
      posthog.init(token, {
        // PostHog's managed proxy on our domain: Firefox's tracking protection blocks
        // PostHog's own hosts, and with them the support chat.
        api_host: 'https://e.ssmusor.ro',
        ui_host: 'https://eu.posthog.com',
        defaults: '2026-05-30',
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: { dom_event_allowlist: ['click', 'submit'] },
        mask_all_element_attributes: true,
        mask_all_text: true,
        persistence: 'localStorage',
        opt_out_capturing_by_default: true,
        cross_subdomain_cookie: false,
        capture_exceptions: {
          capture_unhandled_errors: true,
          capture_unhandled_rejections: true,
          capture_console_errors: false,
        },
        enable_recording_console_log: false,
        // Off until usePostHogSession knows whether the session acts as a member.
        disable_session_recording: true,
        session_recording: {
          // maskAllInputs leaves a file field's value, which names the chosen file, unmasked.
          maskAllInputs: false,
          maskInputOptions: everyInputType,
          maskInputFn: maskReplayInput,
          // rrweb calls maskTextFn only for text under maskTextSelector, and every text needs
          // the check for a CNP, an email address or a phone number.
          maskTextSelector: '*',
          maskTextFn: maskReplayText,
          maskAttributeFn: maskReplayAttribute,
          blockSelector: '[data-no-replay]',
          recordBody: false,
          recordHeaders: false,
          captureJsonLd: false,
        },
      });
      return posthog;
    })
    .catch((error: unknown) => {
      clientPromise = null;
      throw error;
    });

  return clientPromise;
}

// Never loads PostHog: a page without a signed-in user has none running, and capturing is
// off until the session opts in.
export function captureEvent(event: string, properties: Record<string, unknown>) {
  void clientPromise?.then((client) => client?.capture(event, properties)).catch(() => {});
}

const pendingEventsKey = 'ssm-usor.posthog-pending-events';

const pendingEventsSchema = z.array(
  z.object({
    userId: z.string(),
    event: z.string(),
    properties: z.record(z.string(), z.unknown()),
    timestamp: z.iso.datetime(),
  })
);

function readPendingEvents() {
  const parsed = pendingEventsSchema.safeParse(
    JSON.parse(localStorage.getItem(pendingEventsKey) ?? '[]')
  );
  return parsed.success ? parsed.data : [];
}

// PostHog runs only for members, who have accepted the terms with their organization, so an
// event from before that waits in this browser for the account's first member session. It
// names its account because another one may be the next to sign in here.
export function captureAsMember(
  userId: string,
  event: string,
  properties: Record<string, unknown>
) {
  if (!import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim()) return;
  try {
    localStorage.setItem(
      pendingEventsKey,
      JSON.stringify([
        ...readPendingEvents(),
        { userId, event, properties, timestamp: new Date().toISOString() },
      ])
    );
  } catch {
    // Storage can be full or blocked; the event is lost, the page is not.
  }
}

export function sendPendingEvents(client: PostHog, userId: string) {
  let pending: z.infer<typeof pendingEventsSchema>;
  try {
    pending = readPendingEvents();
    localStorage.removeItem(pendingEventsKey);
  } catch {
    return;
  }
  for (const { userId: owner, event, properties, timestamp } of pending) {
    if (owner === userId) client.capture(event, properties, { timestamp: new Date(timestamp) });
  }
}

export function stopPostHog(client: PostHog) {
  client.conversations.hide();
  client.clearIdentity();
  client.reset();
  client.stopSessionRecording();
  client.opt_out_capturing();
}

export async function openSupportChat(client: PostHog): Promise<boolean> {
  for (let attempt = 0; attempt < 30 && !client.conversations.isAvailable(); attempt++) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  if (!client.conversations.isAvailable()) return false;
  client.conversations.show();

  // PostHog's public show() renders the widget in its saved open/closed state. Its closed
  // launcher is hidden because the app's sidebar is the entry point, so activate that button.
  return new Promise<boolean>((resolve) => {
    function openWhenRendered() {
      const container = document.getElementById('ph-conversations-widget-container');
      const launcher = container?.querySelector<HTMLButtonElement>(
        'button[aria-label^="Open chat"]'
      );
      if (launcher) {
        launcher.click();
        return true;
      }
      return Boolean(container?.querySelector('button[aria-label="Close"]'));
    }

    if (openWhenRendered()) return resolve(true);
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, 2_000);
    const observer = new MutationObserver(() => {
      if (!openWhenRendered()) return;
      observer.disconnect();
      clearTimeout(timeout);
      resolve(true);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}
