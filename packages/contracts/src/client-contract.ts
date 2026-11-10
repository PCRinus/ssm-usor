import { clientContractFingerprints } from './client-contracts.gen';

export { clientContractFingerprints };

export const clientContractHeader = 'X-Client-Contract';

export type ContractClient = keyof typeof clientContractFingerprints;

export const clientContract = (client: ContractClient) =>
  `${client}:${clientContractFingerprints[client]}`;
