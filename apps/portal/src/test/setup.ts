import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';

import { activateLocale, sourceLocale } from '@/app/i18n';

beforeAll(() => activateLocale(sourceLocale));

afterEach(cleanup);

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()));

// jsdom lacks what the Radix menu of the account needs to open.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
