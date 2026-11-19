// Unticked, an item is written only when the member ticks it: what only another company's
// passages give, the legal representative as an employee, who is one only when the documents
// show them on the staff (ADR 030), which a reading too often assumes, and a post that is only
// the running of the firm, which nobody may hold as a worker.
export function proposedUntickedReason(item: {
  otherCompanyName: string | null;
  role?: unknown;
  managementOnly?: unknown;
}) {
  if (item.otherCompanyName !== null) return 'other_company';
  if (item.role === 'legal_representative') return 'legal_representative';
  if (item.managementOnly === true) return 'management_only';
  return null;
}

export const proposedIncluded = (item: Parameters<typeof proposedUntickedReason>[0]) =>
  proposedUntickedReason(item) === null;
