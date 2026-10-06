import { useEffect, useSyncExternalStore } from 'react';
import { z } from 'zod';

// Kept in the tab's session storage rather than in the address or the history state: it has to
// survive a reload and the moves between tabs, and the organization and profile pages, which are
// not under the client, still have to know which client to go back to.
const storageKey = 'ssm-usor:way-back';

// Nothing dismisses it by hand, so an old trip must not offer a way back to a form long closed.
export const wayBackLifetime = 60 * 60 * 1000;

const wayBackSchema = z.object({
  userId: z.string(),
  clientId: z.uuid(),
  to: z.enum(['documents', 'fire-safety-documents', 'client-contract', 'lead-contract']),
  startedAt: z.number(),
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
    // Without storage no toast offers the way back; the rows still lead to their fields.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const startWayBack = (wayBack: Omit<WayBack, 'startedAt'>) =>
  write(JSON.stringify({ ...wayBack, startedAt: Date.now() }));

export const endWayBack = () => write(null);

function parse(raw: string | null, userId: string | undefined) {
  if (!raw) return null;
  try {
    const parsed = wayBackSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.userId !== userId) return null;
    return Date.now() - parsed.data.startedAt < wayBackLifetime ? parsed.data : null;
  } catch {
    return null;
  }
}

export const currentWayBack = (userId: string | undefined) => parse(read(), userId);

export function useEndWayBackOutside(companyId: string, userId: string | undefined) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const wayBack = parse(raw, userId);
  const elsewhere = wayBack !== null && wayBack.clientId !== companyId;
  useEffect(() => {
    if (elsewhere) endWayBack();
  }, [elsewhere]);
}
