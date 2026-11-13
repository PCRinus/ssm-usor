import type { PostHog } from 'posthog-js';

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

const addressAttributes = new Set(['href', 'src']);

function isSameOrigin(address: string) {
  try {
    return new URL(address, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

// Replays keep `class` and `style`, or they play as bare HTML. A link to another origin can
// carry a signed file address and the file's name, so only the portal's own addresses stay.
export function maskReplayAttribute(name: string, value: string) {
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
  ])
    .then(([{ default: posthog }]) => {
      posthog.init(token, {
        // PostHog's managed proxy on our domain, as in the app: Firefox's tracking protection
        // blocks PostHog's own hosts.
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
        // The project's Support widget is the app's; a participant asks their provider instead.
        disable_conversations: true,
        enable_recording_console_log: false,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '*',
          maskAttributeFn: maskReplayAttribute,
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

// Never loads PostHog: a page without a signed-in participant has none running, and capturing
// is off until the session opts in.
export function captureEvent(event: string, properties: Record<string, unknown>) {
  void clientPromise?.then((client) => client?.capture(event, properties)).catch(() => {});
}

export function stopPostHog(client: PostHog) {
  client.reset();
  client.stopSessionRecording();
  client.opt_out_capturing();
}
