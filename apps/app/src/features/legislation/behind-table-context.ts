import { createContext, useContext } from 'react';

import type { BehindType } from './regeneration-copy';
import type { JobProgress } from './regenerations-context';

export type RowState = 'idle' | 'waiting' | 'running' | 'done';

export function rowStateOf(job: JobProgress | undefined): RowState {
  if (!job) return 'idle';
  if (job.ended) return 'done';
  return job.done + job.skipped + job.failed > 0 ? 'running' : 'waiting';
}

export const detailsIdOf = (type: BehindType) => `behind-clients-${type.typeKey}`;

// The columns stay the same objects across renders, so a cell keeps its focus when a row opens
// or a job moves on; what changes reaches the cells through here.
export interface BehindTable {
  isOpen: (type: BehindType) => boolean;
  onToggle: (type: BehindType) => void;
  stateOf: (type: BehindType) => RowState;
  onRegenerate: (type: BehindType) => void;
  busy: boolean;
}

export const BehindTableContext = createContext<BehindTable | null>(null);

export function useBehindTable() {
  const context = useContext(BehindTableContext);
  if (!context) throw new Error('The documents behind cells need a BehindTableContext.');
  return context;
}
