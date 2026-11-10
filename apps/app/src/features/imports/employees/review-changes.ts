import {
  type Changes,
  type FieldName,
  type FieldValue,
  withField,
  withPersonChange,
} from './employee-review-model';

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

export function withFields(
  changes: Changes,
  personId: string,
  values: Partial<Record<FieldName, FieldValue | null>>
) {
  const written = Object.entries(values).reduce(
    (current, [name, value]) => withField(current, personId, name as FieldName, { value }),
    changes
  );
  // A CNP written over the offered correction is the one confirming takes.
  return 'cnp' in values
    ? withPersonChange(written, personId, (change) => ({ ...change, cnpCorrection: undefined }))
    : written;
}
