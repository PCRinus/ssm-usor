import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadPostHog, maskReplayAttribute } from './posthog';

const { sdk } = vi.hoisted(() => ({ sdk: { loaded: [] as string[] } }));
vi.mock('posthog-js', () => ({
  default: { init: vi.fn(() => sdk.loaded.push('init')) },
}));
vi.mock('posthog-js/dist/posthog-recorder', () => {
  sdk.loaded.push('recorder');
  return {};
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('session replay', () => {
  it('starts PostHog with its recorder already defined and only some attributes masked', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_test');
    const client = await loadPostHog();

    expect(sdk.loaded).toEqual(['recorder', 'init']);
    expect(client?.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        session_recording: expect.objectContaining({
          maskTextSelector: '*',
          maskAttributeFn: maskReplayAttribute,
        }),
      })
    );
    expect(vi.mocked(client!.init).mock.calls[0]![1]!.session_recording).not.toHaveProperty(
      'maskAllElementAttributes'
    );
  });

  it.each([
    ['title', 'Ion Pop'],
    ['alt', 'Sigla Brutăria Popescu SRL'],
    ['aria-label', 'Semnează fișa lui Ion Pop'],
    ['placeholder', 'Ion Pop'],
    ['value', '0722 123 456'],
  ])('masks %s, which can carry a name', (name, value) => {
    expect(maskReplayAttribute(name, value)).toBe('*'.repeat(value.length));
  });

  it.each([
    ['class', 'flex items-center gap-3 border-b bg-card'],
    ['style', '--header-height: 4rem;'],
    ['role', 'dialog'],
    ['data-state', 'open'],
    ['href', '/semneaza'],
    ['src', '/brand/logo.svg'],
  ])('keeps %s %s, which the replay needs to look like the page', (name, value) => {
    expect(maskReplayAttribute(name, value)).toBe(value);
  });

  it('masks an address outside the portal', () => {
    const value = 'https://api.ssmusor.ro/files/download?name=Fi%C8%99a%20Ion%20Pop.pdf';
    expect(maskReplayAttribute('href', value)).toBe('*'.repeat(value.length));
  });
});
