import type { PostHog } from 'posthog-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureAsMember,
  loadPostHog,
  maskReplayAttribute,
  openSupportChat,
  sendPendingEvents,
  stopPostHog,
} from './posthog';
import { maskReplayInput, maskReplayText, replayShow } from './replay-masking';

const { sdk } = vi.hoisted(() => ({ sdk: { loaded: [] as string[] } }));
vi.mock('posthog-js', () => ({
  default: { init: vi.fn(() => sdk.loaded.push('init')) },
}));
vi.mock('posthog-js/dist/posthog-recorder', () => {
  sdk.loaded.push('recorder');
  return {};
});
vi.mock('posthog-js/dist/exception-autocapture', () => {
  sdk.loaded.push('exception-autocapture');
  return {};
});
vi.mock('posthog-js/dist/web-vitals-with-attribution', () => {
  sdk.loaded.push('web-vitals-with-attribution');
  return {};
});
vi.mock('posthog-js/dist/conversations', () => {
  sdk.loaded.push('conversations');
  return {};
});

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

describe('session replay', () => {
  it('starts PostHog with its recorder already defined, and recording off', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test');
    const client = await loadPostHog();

    expect(sdk.loaded.at(-1)).toBe('init');
    expect(sdk.loaded.slice(0, -1).sort()).toEqual(
      ['recorder', 'exception-autocapture', 'web-vitals-with-attribution', 'conversations'].sort()
    );
    expect(client?.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        disable_session_recording: true,
        session_recording: expect.objectContaining({
          maskAllInputs: false,
          maskInputOptions: expect.objectContaining({ text: true, file: true, password: true }),
          maskInputFn: maskReplayInput,
          maskTextSelector: '*',
          maskTextFn: maskReplayText,
          maskAttributeFn: maskReplayAttribute,
          blockSelector: '[data-no-replay]',
        }),
      })
    );
    expect(vi.mocked(client!.init).mock.calls[0]![1]!.session_recording).not.toHaveProperty(
      'maskAllElementAttributes'
    );
  });

  it.each([
    ['title', 'Brutăria Popescu SRL'],
    ['alt', 'Fotografia fisa-ion-pop.jpg'],
    ['aria-label', 'Deschide Ion Pop'],
    ['aria-valuetext', 'Ion Pop'],
    ['placeholder', 'Ion Pop'],
    ['value', 'Ion Pop'],
    ['data-value', 'Ion Pop'],
    ['download', 'Fișa Ion Pop.pdf'],
  ])('masks %s, which can carry a name', (name, value) => {
    expect(maskReplayAttribute(name, value)).toBe('*'.repeat(value.length));
  });

  it.each([
    ['class', 'flex items-center gap-3 border-b bg-card'],
    ['style', '--sidebar-width: 16rem;'],
    ['id', 'nav-section-clients'],
    ['role', 'dialog'],
    ['type', 'button'],
    ['data-state', 'open'],
    ['href', '/clienti/4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d'],
    ['href', 'http://localhost:5173/assets/index-DMOD9hrb.css'],
    ['src', '/brand/logo.png'],
  ])('keeps %s %s, which the replay needs to look like the page', (name, value) => {
    expect(maskReplayAttribute(name, value)).toBe(value);
  });

  it.each([
    'https://api.ssmusor.ro/files/download?source=https%3A%2F%2Fstorage%2Fsign%3Ftoken%3Dabc&name=Fi%C8%99a%20Ion%20Pop.pdf',
    'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  ])('masks an address outside the app: %s', (value) => {
    expect(maskReplayAttribute('href', value)).toBe('*'.repeat(value.length));
    expect(maskReplayAttribute('src', value)).toBe('*'.repeat(value.length));
  });

  it("keeps a field's value only where the field shows", () => {
    const shown = document.createElement('input');
    shown.setAttribute(Object.keys(replayShow)[0]!, '');
    const unmarked = document.createElement('input');
    const option = document.createElement('div');
    document.body.append(shown, unmarked, option);

    expect(maskReplayAttribute('value', 'Sudor', shown)).toBe('Sudor');
    expect(maskReplayAttribute('value', 'Ion Pop', unmarked)).toBe('*******');
    expect(maskReplayAttribute('value', 'Ion Pop', option)).toBe('*******');
    expect(maskReplayAttribute('data-value', 'Ion Pop', shown)).toBe('*******');
    document.body.replaceChildren();
  });
});
