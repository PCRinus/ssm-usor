import { workplaceKindLabels } from '@ssm-usor/contracts';

import type { WorkplaceListResponse } from '@/api/generated/api';
import { roCount } from '@/features/employees/employee-format';
import type {
  FireEquipment,
  FireInstallation,
} from '@/features/fire-safety-means/fire-means-schema';

import type { ListedWorkplace } from './workplace-schema';

export interface WorkplaceMeans {
  count: number;
  extinguishers: number;
  overdue: number;
  // The earliest check not yet overdue.
  nextCheck: string | null;
}

export type WorkplaceRow =
  | { kind: 'workplace'; workplace: ListedWorkplace; means: WorkplaceMeans | undefined }
  | { kind: 'unassigned'; count: number };

export function workplaceRows(
  list: WorkplaceListResponse,
  fire: { equipment: readonly FireEquipment[]; installations: readonly FireInstallation[] } | null,
  today: string
): WorkplaceRow[] {
  const rows: WorkplaceRow[] = list.items.map((workplace) => ({
    kind: 'workplace',
    workplace,
    means: fire ? workplaceMeans(workplace.id, fire, today) : undefined,
  }));
  if (list.unassignedEmployeeCount > 0) {
    rows.push({ kind: 'unassigned', count: list.unassignedEmployeeCount });
  }
  return rows;
}

function workplaceMeans(
  workplaceId: string,
  fire: { equipment: readonly FireEquipment[]; installations: readonly FireInstallation[] },
  today: string
): WorkplaceMeans {
  const equipment = fire.equipment.filter((unit) => unit.workplaceId === workplaceId);
  const installations = fire.installations.filter((item) => item.workplaceId === workplaceId);
  const checks = [
    ...equipment.map((unit) => unit.nextServiceOn),
    ...installations.map((item) => item.nextCheckOn),
  ].filter((date): date is string => date !== null);
  const ahead = checks.filter((date) => date >= today).sort();
  return {
    count: equipment.length + installations.length,
    extinguishers: equipment.filter((unit) => unit.kind === 'extinguisher').length,
    overdue: checks.length - ahead.length,
    nextCheck: ahead[0] ?? null,
  };
}

export const meansLabel = (count: number) => roCount(count, 'mijloc', 'mijloace');

export const overdueLabel = (count: number) => `${count} cu verificarea depășită`;

export function workplaceKindNote(workplace: ListedWorkplace) {
  if (workplace.isRegisteredOffice) {
    return workplace.officeHasActivity ? 'Sediu social' : 'Sediu social, fără activitate';
  }
  return workplace.kind === 'mobile_site' ? workplaceKindLabels.mobile_site : null;
}

// The fire-safety set asks every workplace where work happens for an extinguisher.
export const needsExtinguisher = (workplace: ListedWorkplace, means: WorkplaceMeans) =>
  workplace.officeHasActivity && means.extinguishers === 0;
