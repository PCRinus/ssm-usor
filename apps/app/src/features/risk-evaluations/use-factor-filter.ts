import { useState } from 'react';

import { isInCell, type MatrixCell, sameCell } from './factor-list';
import type { RiskFactor } from './risk-evaluation-schema';

export interface FactorFilter {
  cell: MatrixCell | null;
  toggle: (cell: MatrixCell) => void;
  clear: () => void;
}

export function useFactorFilter(factors: readonly RiskFactor[], listId: string): FactorFilter {
  const [picked, setPicked] = useState<MatrixCell | null>(null);
  const cell = picked && factors.some((factor) => isInCell(factor, picked)) ? picked : null;

  return {
    cell,
    toggle: (next) => {
      if (sameCell(cell, next)) {
        setPicked(null);
        return;
      }
      setPicked(next);
      requestAnimationFrame(() => revealList(listId));
    },
    clear: () => setPicked(null),
  };
}

// On a phone, and on an evaluation where the work system sits between the cards, the list is
// below the fold and a click on the grid would seem to do nothing.
function revealList(listId: string) {
  const list = document.getElementById(listId);
  if (!list || list.getBoundingClientRect().top < window.innerHeight - 160) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  list.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
