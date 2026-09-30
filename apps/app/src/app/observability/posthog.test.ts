import type { PostHog } from 'posthog-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openSupportChat, stopPostHog } from './posthog';

afterEach(() => {
  document.getElementById('ph-conversations-widget-container')?.remove();
  vi.restoreAllMocks();
});

describe('PostHog Support adapter', () => {
  it('opens the built-in chat from the sidebar action', async () => {
    const launcher = document.createElement('button');
    launcher.setAttribute('aria-label', 'Open chat');
    const click = vi.spyOn(launcher, 'click');
    const container = document.createElement('div');
    container.id = 'ph-conversations-widget-container';
    container.append(launcher);
    document.body.append(container);
    const show = vi.fn();
    const client = { conversations: { isAvailable: () => true, show } } as unknown as PostHog;

    expect(await openSupportChat(client)).toBe(true);
    expect(show).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it('clears the signed Support identity and recording when the user leaves', () => {
    const calls: string[] = [];
    const client = {
      conversations: { hide: () => calls.push('hide') },
      clearIdentity: () => calls.push('clearIdentity'),
      reset: () => calls.push('reset'),
      stopSessionRecording: () => calls.push('stopRecording'),
      opt_out_capturing: () => calls.push('optOut'),
    } as unknown as PostHog;

    stopPostHog(client);
    expect(calls).toEqual(['hide', 'clearIdentity', 'reset', 'stopRecording', 'optOut']);
  });
});
