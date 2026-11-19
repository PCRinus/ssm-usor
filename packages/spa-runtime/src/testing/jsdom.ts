import { toast } from '@ssm-usor/ui/lib/toast';
import { afterEach, beforeEach, vi } from 'vitest';

import { fakeTurnstile } from './turnstile';

// Testing Library's cleanup and configure stay in each app's setup: this package does not
// resolve the apps' copy of it, and a second copy would clean up nothing the tests rendered.
export function installUiTestEnvironment() {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  // Sonner keeps its toasts in a module-level store, so one test's toast would show up in the next.
  afterEach(() => {
    toast.dismiss();
  });

  beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()));

  // jsdom does not implement element resize observation used by Radix positioning primitives
  // and the shared table's shading of its cut-off edges.
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

  // jsdom does not implement media queries used by responsive UI primitives.
  beforeEach(() =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )
  );

  // jsdom lacks these element APIs used by Radix popovers and menus and the cmdk list.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  // jsdom loads no external script, so the widget is a fake that hands out tokens at once.
  beforeEach(() => vi.stubGlobal('turnstile', fakeTurnstile()));
}
