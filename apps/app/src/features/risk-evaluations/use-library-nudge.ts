import { useState } from 'react';

import { hasLibraryFactor } from './factor-origin';
import type { RiskEvaluation } from './risk-evaluation-schema';

const dismissedKey = (evaluationId: string) => `ssm-usor:library-nudge-dismissed:${evaluationId}`;

function readDismissed(evaluationId: string) {
  try {
    return localStorage.getItem(dismissedKey(evaluationId)) === 'true';
  } catch {
    return false;
  }
}

function saveDismissed(evaluationId: string) {
  try {
    localStorage.setItem(dismissedKey(evaluationId), 'true');
  } catch {
    // Without storage the invitation comes back on the next visit.
  }
}

export function useLibraryNudge(evaluation: RiskEvaluation, readOnly: boolean) {
  const [dismissed, setDismissed] = useState(() => ({
    evaluationId: evaluation.id,
    on: readDismissed(evaluation.id),
  }));
  if (dismissed.evaluationId !== evaluation.id) {
    setDismissed({ evaluationId: evaluation.id, on: readDismissed(evaluation.id) });
  }
  const shown =
    !readOnly &&
    !dismissed.on &&
    evaluation.factors.length > 0 &&
    !hasLibraryFactor(evaluation.factors);
  return {
    shown,
    dismiss: () => {
      setDismissed({ evaluationId: evaluation.id, on: true });
      saveDismissed(evaluation.id);
    },
  };
}
