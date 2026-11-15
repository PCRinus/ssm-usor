import type { ServiceContractState } from '@ssm-usor/contracts';

export const contractStateLabels: Record<ServiceContractState, string> = {
  none: 'Fără contract',
  draft: 'Ciornă',
  issued: 'Emis',
  sent: 'Trimis',
  received: 'Primit',
  signed: 'Semnat',
};
