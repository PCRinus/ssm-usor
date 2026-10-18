import type { PostHog } from 'posthog-js';

let clientPromise: Promise<PostHog | null> | null = null;

export function loadPostHog(): Promise<PostHog | null> {
  const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) return Promise.resolve(null);

  clientPromise ??= import('posthog-js')
    .then(({ default: posthog }) => {
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
          maskAllElementAttributes: true,
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
