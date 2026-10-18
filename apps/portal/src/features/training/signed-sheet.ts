import type { TrainingDomain } from '@ssm-usor/contracts';

import type { PortalTrainingSheetsResponse } from '@/api/generated/api';

// A sheet is stored at its first electronic signature, so a stored sheet holds one.
export const signedSheet = (sheet: PortalTrainingSheetsResponse[TrainingDomain] | undefined) =>
  sheet !== undefined && sheet.stored && sheet.sequences.length > 0;
