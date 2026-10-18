import { type WorkSystemComponent, workSystemComponentGroups } from '@ssm-usor/contracts';

import { normalizeSearch } from '@/lib/normalize-search';

const methodGroups = new Set<string>(Object.values(workSystemComponentGroups).flat());

export function groupUnder(component: WorkSystemComponent, group: string) {
  const groups: readonly string[] = workSystemComponentGroups[component];
  return methodGroups.has(group) && !groups.includes(group) ? '' : group;
}

const normalizedMethodGroups = new Set([...methodGroups].map(normalizeSearch));

export function ownGroups(typed: readonly string[]) {
  return typed.filter((group) => !normalizedMethodGroups.has(normalizeSearch(group.trim())));
}
