import type { RiskZonesResponse } from '@ssm-usor/contracts';

export const riskZonesPath = (clientId: string) => `/clients/${clientId}/risk-zones`;

export const noRiskZones: RiskZonesResponse = {
  state: 'undecided',
  zones: [],
  suggestions: [],
  ignoredSuggestions: [],
  factors: [],
};
