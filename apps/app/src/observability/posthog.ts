import type { PostHog } from 'posthog-js';

let clientPromise: Promise<PostHog | null> | null = null;

export function loadPostHog(): Promise<PostHog | null> {
  const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) return Promise.resolve(null);

  clientPromise ??= import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(token, {
        api_host: 'https://eu.i.posthog.com',
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
