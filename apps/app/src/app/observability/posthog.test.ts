import type { PostHog } from 'posthog-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureAsMember, openSupportChat, sendPendingEvents, stopPostHog } from './posthog';

afterEach(() => {
  document.getElementById('ph-conversations-widget-container')?.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('events from before PostHog runs', () => {
  const capturing = () => {
    const capture = vi.fn();
    return { capture, client: { capture } as unknown as PostHog };
  };

  it("sends them, with when they happened, in the account's first member session", () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test');
    captureAsMember('user-one', 'signed_up', { method: 'password' });
    const { capture, client } = capturing();

    sendPendingEvents(client, 'user-one');
    sendPendingEvents(client, 'user-one');

    expect(capture).toHaveBeenCalledExactlyOnceWith(
      'signed_up',
      { method: 'password' },
      { timestamp: expect.any(Date) }
    );
  });

  it('drops one that names another account than the member signing in', () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test');
    captureAsMember('user-one', 'signed_up', { method: 'password' });
    const { capture, client } = capturing();

    sendPendingEvents(client, 'user-two');
    sendPendingEvents(client, 'user-one');

    expect(capture).not.toHaveBeenCalled();
  });

  it('keeps nothing where PostHog is not configured', () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', '');
    captureAsMember('user-one', 'signed_up', { method: 'password' });

    expect(localStorage.length).toBe(0);
  });
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
