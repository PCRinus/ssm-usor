import type { AdminLegalAct } from '@ssm-usor/contracts';

import type { ActSortKey } from './api';
import { statusLabels } from './format';

const collator = new Intl.Collator('ro', { numeric: true });

const sortValues: Record<ActSortKey, (act: AdminLegalAct) => string | null> = {
  name: (act) => act.name,
  status: (act) => (act.portalStatus ? statusLabels[act.portalStatus] : null),
  seen: (act) => act.lastConsolidatedOn,
  verified: (act) => act.verifiedConsolidatedOn,
  checked: (act) => act.lastCheckedAt,
  byHand: (act) => act.checkedByHandOn,
};

export function sortActs(acts: readonly AdminLegalAct[], sort: ActSortKey, order: 'asc' | 'desc') {
  const value = sortValues[sort];
  const direction = order === 'asc' ? 1 : -1;
  return [...acts].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null || right === null) {
      if (left !== right) return left === null ? 1 : -1;
    } else {
      const compared = collator.compare(left, right);
      if (compared !== 0) return compared * direction;
    }
    return collator.compare(a.name, b.name);
  });
}
