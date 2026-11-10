import { useSyncExternalStore } from 'react';

import { captureEvent } from '@/app/observability/posthog';

import { snapshotTypedText } from './kept-text';
import { browserPage } from './reload-page';

// '426': the API refused this build's contract. 'code_file': a code file of this build is gone.
export type ReloadCause = '426' | 'code_file';

export interface ReloadDialogState {
  cause: ReloadCause;
  // A change the person asked to save was refused, so it is not saved.
  unsavedChange: boolean;
  keptText: boolean;
  // When the dialog opened within a minute of its own reload, the end of that minute.
  lockedUntil: number | null;
}

const reloadedAtKey = 'ssm-usor.reload-dialog-reloaded-at';
export const deployWindow = 60_000;

let state: ReloadDialogState | null = null;
const listeners = new Set<() => void>();
let currentPage = () => `${window.location.pathname}${window.location.search}`;

function emit() {
  listeners.forEach((listener) => listener());
}

export function setReloadPage(page: () => string) {
  currentPage = page;
}

function readReloadedAt() {
  try {
    const stamp = Number(sessionStorage.getItem(reloadedAtKey));
    return Number.isFinite(stamp) && stamp > 0 ? stamp : null;
  } catch {
    return null;
  }
}

export function openReloadDialog(
  cause: ReloadCause,
  { unsavedChange = false }: { unsavedChange?: boolean } = {}
) {
  if (state) {
    if (unsavedChange && !state.unsavedChange) {
      state = { ...state, unsavedChange };
      emit();
    }
    return;
  }
  // Before the dialog opens: it hides the rest of the page from the fields' lookup.
  const keptText = snapshotTypedText(currentPage());
  const now = Date.now();
  const reloadedAt = readReloadedAt();
  const lockedUntil =
    reloadedAt !== null && now - reloadedAt < deployWindow ? reloadedAt + deployWindow : null;
  state = { cause, unsavedChange, keptText, lockedUntil };
  captureEvent('client_outdated_shown', { client: 'app', cause });
  emit();
}

export function reloadFromDialog() {
  captureEvent('reload_clicked', { prompt: 'dialog' });
  try {
    sessionStorage.setItem(reloadedAtKey, String(Date.now()));
  } catch {
    // Without the stamp a dialog after this reload opens unlocked.
  }
  browserPage.reload();
}

export function resetReloadDialog() {
  state = null;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getState = () => state;

export function useReloadDialogState() {
  return useSyncExternalStore(subscribe, getState, getState);
}

// The browsers' words for a failed dynamic import, as TanStack Router reads them. An import
// that Vite reported has already opened the dialog: the reload prompts cancel Vite's rethrow,
// so the route then fails with a TypeError that names no file.
const failedImport = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
];

export function isCodeFileError(error: unknown) {
  if (state?.cause === 'code_file') return true;
  const message = error instanceof Error ? error.message : '';
  return failedImport.some((start) => message.startsWith(start));
}
