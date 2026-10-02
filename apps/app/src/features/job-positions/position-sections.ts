// Other pages link to these sections of a job position's page by hash, so renaming one breaks
// their links.
export const positionSections = {
  details: 'details',
  equipment: 'protective-equipment',
  instructions: 'instructions',
  riskEvaluation: 'risk-evaluation',
} as const;

export type PositionSection = (typeof positionSections)[keyof typeof positionSections];
