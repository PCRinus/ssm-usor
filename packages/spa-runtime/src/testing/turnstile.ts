import type { Turnstile, TurnstileOptions } from '@ssm-usor/ui/hooks/use-turnstile';
import { vi } from 'vitest';

// A new token for every render and reset, as the real widget gives, so a test can tell a
// spent token from a fresh one.
export function fakeTurnstile() {
  let widgets = 0;
  let tokens = 0;
  const callbacks = new Map<string, TurnstileOptions['callback']>();
  const issue = (id: string) =>
    queueMicrotask(() => callbacks.get(id)?.(`turnstile-token-${++tokens}`));
  return {
    render: vi.fn<Turnstile['render']>((_container, options) => {
      const id = `widget-${++widgets}`;
      callbacks.set(id, options.callback);
      issue(id);
      return id;
    }),
    reset: vi.fn<Turnstile['reset']>((id) => issue(id)),
    remove: vi.fn<Turnstile['remove']>((id) => {
      callbacks.delete(id);
    }),
  };
}
