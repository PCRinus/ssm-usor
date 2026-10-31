import { useCallback, useRef } from 'react';

export interface TurnstileOptions {
  sitekey: string;
  appearance: 'interaction-only';
  size: 'flexible';
  callback(token: string): void;
  'expired-callback'(): void;
  'error-callback'(): void;
}

export interface Turnstile {
  render(container: HTMLElement, options: TurnstileOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const scriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<Turnstile> | undefined;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not start.'));
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error('Turnstile did not load.'));
    };
    document.head.append(script);
  });
  return loading;
}

// Without a site key there is no widget and every token is undefined, which an auth server
// with CAPTCHA off accepts.
export function useTurnstile(siteKey: string | undefined) {
  const widget = useRef<{ turnstile: Turnstile; id: string } | null>(null);
  const token = useRef<string | undefined>(undefined);
  const failed = useRef(false);
  const waiting = useRef<((token: string | undefined) => void)[]>([]);

  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !siteKey) return;
      let removed = false;
      const settle = (value: string | undefined) => {
        token.current = value;
        for (const resolve of waiting.current.splice(0)) resolve(value);
      };
      loadTurnstile().then(
        (turnstile) => {
          if (removed) return;
          failed.current = false;
          const id = turnstile.render(element, {
            sitekey: siteKey,
            appearance: 'interaction-only',
            size: 'flexible',
            callback: settle,
            'expired-callback': () => {
              token.current = undefined;
            },
            'error-callback': () => settle(undefined),
          });
          widget.current = { turnstile, id };
        },
        () => {
          failed.current = true;
          settle(undefined);
        }
      );
      return () => {
        removed = true;
        if (widget.current) widget.current.turnstile.remove(widget.current.id);
        widget.current = null;
        token.current = undefined;
      };
    },
    [siteKey]
  );

  function nextToken() {
    if (!siteKey || failed.current) return Promise.resolve(undefined);
    if (token.current) return Promise.resolve(token.current);
    return new Promise<string | undefined>((resolve) => waiting.current.push(resolve));
  }

  // Turnstile accepts a token once, whether or not the call that carried it succeeded.
  async function withToken<T>(run: (captchaToken: string | undefined) => Promise<T>) {
    const captchaToken = await nextToken();
    token.current = undefined;
    try {
      return await run(captchaToken);
    } finally {
      if (widget.current) widget.current.turnstile.reset(widget.current.id);
    }
  }

  return { ref, withToken };
}
