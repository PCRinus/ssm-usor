// The API refuses a stored release that breaks one of these, and one such row fails the whole list
// of releases, so the parser holds the published body to the same lengths as the API's contract
// and the database's checks. Counted as JavaScript string lengths, as zod's `max` counts them.
export const updateLimits = {
  headline: 160,
  lead: 600,
  featureTitle: 160,
  featureText: 1200,
  featureWhere: 200,
} as const;

export function tooLong(what: string, length: number, limit: number): string {
  return `${what} is ${length} characters long; the most is ${limit}.`;
}
