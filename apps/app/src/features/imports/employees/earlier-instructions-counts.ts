import type { InstructionDomain } from '@ssm-usor/contracts';

import { ownRows, type PersonView, type ReviewContext } from './employee-review-model';

export function sheetTrainingCounts(context: ReviewContext, views: PersonView[]) {
  const counts: Record<InstructionDomain, number> = { ssm: 0, su: 0 };
  for (const view of views) {
    if (!view.included) continue;
    for (const { row } of ownRows(context, view.person.id)) {
      if (!row.testOnly) counts[row.domain] += 1;
    }
  }
  return counts;
}
