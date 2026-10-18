import { type WorkSystemComponent, workSystemComponentGroups } from '@ssm-usor/contracts';

const methodGroups = new Set<string>(Object.values(workSystemComponentGroups).flat());

export function groupUnder(component: WorkSystemComponent, group: string) {
  const groups: readonly string[] = workSystemComponentGroups[component];
  return methodGroups.has(group) && !groups.includes(group) ? '' : group;
}
