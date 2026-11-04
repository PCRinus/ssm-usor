import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// The default 1 s wait for an element runs out when several suites share the machine.
configure({ asyncUtilTimeout: 5_000 });

afterEach(cleanup);

afterEach(() => vi.restoreAllMocks());

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()));

// jsdom has no ResizeObserver, which the shared table uses to shade its cut-off edges.
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
);

// jsdom loads no external script, so Turnstile is a fake that hands out a token at once, and
// another after every reset, as the real widget does.
beforeEach(() => {
  let issue = () => {};
  vi.stubGlobal('turnstile', {
    render: (_element: HTMLElement, options: { callback(token: string): void }) => {
      issue = () => queueMicrotask(() => options.callback('captcha-token'));
      issue();
      return 'widget';
    },
    reset: () => issue(),
    remove: () => {},
  });
});
