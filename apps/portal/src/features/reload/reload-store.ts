import { useEffect, useSyncExternalStore } from 'react';

import { captureEvent } from '@/app/observability/posthog';

// `question` counts from 1: the question on screen, whose tick is not saved yet.
export type ReloadContext =
  { kind: 'test'; question: number } | { kind: 'signing' } | { kind: 'other' };

export type OutdatedCause = '426' | 'code_file';

export type ReloadPrompt = 'toast' | 'dialog';

export interface OutdatedState {
  cause: OutdatedCause;
  context: ReloadContext;
  // Epoch ms until which a reload would most likely meet the same refusal; null outside that minute.
  lockedUntil: number | null;
}

export const deployWindowMs = 60_000;

const reloadStampKey = 'ssm-usor:portal-reload-at';

const otherContext: ReloadContext = { kind: 'other' };

let context: ReloadContext = otherContext;
let outdated: OutdatedState | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function lastReloadAt() {
  try {
    const stamp = Number(sessionStorage.getItem(reloadStampKey));
    return Number.isFinite(stamp) && stamp > 0 ? stamp : null;
  } catch {
    return null;
  }
}

export function openOutdatedDialog(cause: OutdatedCause, now = Date.now()) {
  if (outdated) return;
  const reloadedAt = lastReloadAt();
  const lockedUntil =
    reloadedAt !== null && now - reloadedAt < deployWindowMs ? reloadedAt + deployWindowMs : null;
  outdated = { cause, context, lockedUntil };
  captureEvent('client_outdated_shown', { client: 'portal', cause });
  emit();
}

export const isOutdatedDialogOpen = () => outdated !== null;

export const pageReload = { reload: () => window.location.reload() };

export function reloadPortal(prompt: ReloadPrompt) {
  captureEvent('reload_clicked', { prompt });
  try {
    sessionStorage.setItem(reloadStampKey, String(Date.now()));
  } catch {
    // Storage blocked: the next dialog cannot tell it follows a reload, and still opens.
  }
  pageReload.reload();
}

export function useOutdatedState() {
  return useSyncExternalStore(
    subscribe,
    () => outdated,
    () => null
  );
}

export function useReloadContext(next: ReloadContext) {
  const { kind } = next;
  const question = next.kind === 'test' ? next.question : 0;
  useEffect(() => {
    const own: ReloadContext =
      kind === 'test' ? { kind, question } : kind === 'signing' ? { kind } : otherContext;
    context = own;
    return () => {
      if (context === own) context = otherContext;
    };
  }, [kind, question]);
}

export function resetReloadStore() {
  context = otherContext;
  outdated = null;
  emit();
}
