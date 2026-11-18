import type { DocumentSet } from '@ssm-usor/contracts';
import { createContext, useContext } from 'react';

import { getGetRegenerationJobQueryKey } from '@/api/generated/api';

import type { BehindType, RegenerationJob } from './regeneration-copy';

export const summaryPollMs = 4000;

export type RegenerationScope = 'one' | 'all';

export interface RegenerationBatch {
  id: string;
  set: DocumentSet;
  scope: RegenerationScope;
  jobIds: string[];
  titles: Record<string, string>;
  edited: number;
  // Types the queue refused after others had started; they stay behind.
  notStarted: string[];
  // When the summary that came before the start was read: a job missing from a later one ended.
  startedAt: number;
}

export interface FinishedRegeneration extends RegenerationBatch {
  jobs: RegenerationJob[];
  // Jobs whose result could not be read; their documents show in the list again.
  unread: number;
}

export interface JobProgress {
  id: string;
  typeKey: string;
  total: number;
  done: number;
  skipped: number;
  failed: number;
  ended: boolean;
}

export interface Regenerations {
  running: RegenerationBatch[];
  finished: Partial<Record<DocumentSet, FinishedRegeneration>>;
  progressOf: (set: DocumentSet) => JobProgress[];
  stalled: boolean;
  startOne: (type: BehindType) => Promise<void>;
  startAll: (set: DocumentSet, types: readonly BehindType[]) => Promise<void>;
  followRunning: (set: DocumentSet, types: readonly BehindType[]) => Promise<boolean>;
  dismiss: (set: DocumentSet) => void;
}

export const RegenerationsContext = createContext<Regenerations | null>(null);

export function useRegenerations() {
  const context = useContext(RegenerationsContext);
  if (!context) throw new Error('useRegenerations needs a RegenerationsProvider.');
  return context;
}

export const regenerationJobQueryKey = (jobId: string, userId: string) => [
  ...getGetRegenerationJobQueryKey(jobId),
  userId,
];
