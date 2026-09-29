import { useSyncExternalStore } from 'react';
import { z } from 'zod';

// Kept in the tab's session storage rather than in the address or the history state: it has to
// survive a reload and the moves between tabs, and the organization and profile pages, which are
// not under the client, still have to know which client to go back to.
const storageKey = 'ssm-usor:way-back';

const wayBackSchema = z.object({
  userId: z.string(),
  clientId: z.uuid(),
  to: z.enum(['documents', 'client-contract', 'lead-contract']),
});

export type WayBack = z.infer<typeof wayBackSchema>;

const listeners = new Set<() => void>();

function read() {
  try {
    return sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function write(value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(storageKey);
    else sessionStorage.setItem(storageKey, value);
  } catch {
    // Without storage the strip does not appear; the rows still lead to their fields.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const startWayBack = (wayBack: WayBack) => write(JSON.stringify(wayBack));

export const endWayBack = () => write(null);

function parse(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = wayBackSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function useWayBack(userId: string | undefined): WayBack | null {
  const wayBack = parse(useSyncExternalStore(subscribe, read, () => null));
  return wayBack && wayBack.userId === userId ? wayBack : null;
}
