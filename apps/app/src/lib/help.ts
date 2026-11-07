import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { helpTabName, helpTopicUrl } from '@ssm-usor/help-topics/url';
import type { MouseEvent } from 'react';

import { captureEvent } from '@/app/observability/posthog';

// The links carry no `noopener`: with it, the browser forgets the tab's name and opens a new one
// each time (ADR 028). The help site is ours, so the reference it gets back to the app is harmless.
export const helpTarget = helpTabName;

// Without a topic, the help site's home.
export function helpHref(topic?: HelpTopic) {
  const helpOrigin =
    import.meta.env.VITE_HELP_URL ?? (import.meta.env.DEV ? 'http://localhost:4331' : undefined);
  if (!helpOrigin) return undefined;
  const origin = helpOrigin.replace(/\/+$/, '');
  return topic ? helpTopicUrl(origin, topic) : `${origin}/`;
}

export function captureHelpOpened(topic?: HelpTopic) {
  captureEvent('help_opened', { topic: topic ?? 'home' });
}

// Opened by script, not by the link, because only such a tab may be closed by the help site once
// the member has moved within it, when a newer help tab replaces it (ADR 028).
export function openHelpTab(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const tab = window.open(event.currentTarget.href, helpTarget);
  if (!tab) return;
  event.preventDefault();
  tab.focus();
}
