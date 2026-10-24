import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { helpTopicUrl } from '@ssm-usor/help-topics/url';

import { captureEvent } from '@/app/observability/posthog';

// Every help link opens in this one tab, so a second click reuses it (ADR 028). The links carry
// no `noopener`: with it, the browser forgets the tab's name and opens a new one each time. The
// help site is ours, so the reference it gets back to the app is harmless.
export const helpTarget = 'ssm-usor-ajutor';

// Without a topic, the help site's home.
export function helpHref(topic?: HelpTopic) {
  const helpOrigin =
    import.meta.env.VITE_HELP_URL ?? (import.meta.env.DEV ? 'http://localhost:4331' : undefined);
  if (!helpOrigin) return undefined;
  return topic ? helpTopicUrl(helpOrigin, topic) : `${helpOrigin}/`;
}

export function captureHelpOpened(topic?: HelpTopic) {
  captureEvent('help_opened', { topic: topic ?? 'home' });
}
