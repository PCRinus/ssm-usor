import { useSyncExternalStore } from 'react';

const dismissedKey = 'ssm-usor:update-dismissed';

const listeners = new Set<() => void>();
let dismissedInMemory: string | null = null;

// Storage throws in some private windows; the dialog then stays closed until the next load.
export function readDismissedTag() {
  try {
    return sessionStorage.getItem(dismissedKey);
  } catch {
    return dismissedInMemory;
  }
}

function storeDismissedTag(tag: string) {
  try {
    sessionStorage.setItem(dismissedKey, tag);
  } catch {
    return;
  }
}

export function saveDismissedTag(tag: string) {
  dismissedInMemory = tag;
  storeDismissedTag(tag);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDismissedTag() {
  return useSyncExternalStore(subscribe, readDismissedTag, () => null);
}
