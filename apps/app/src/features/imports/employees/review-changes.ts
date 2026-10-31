import type { Changes } from './employee-review-model';

export function withTitle(changes: Changes, groupId: string, jobPositionId: string): Changes {
  return { ...changes, jobTitles: { ...changes.jobTitles, [groupId]: { jobPositionId } } };
}

export function withWorkplace(
  changes: Changes,
  groupId: string,
  workplaceId: string | null
): Changes {
  return { ...changes, workplaces: { ...changes.workplaces, [groupId]: { workplaceId } } };
}

export function withPage(changes: Changes, pageId: string, personId: string | null): Changes {
  return { ...changes, pages: { ...changes.pages, [pageId]: { personId } } };
}

export function orderedByClosest<T extends { id: string }>(rows: T[], closestId: string | null) {
  const closest = rows.find((row) => row.id === closestId);
  return closest ? [closest, ...rows.filter((row) => row !== closest)] : rows;
}
