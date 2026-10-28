import {
  getSkipMySetupStepMutationKey,
  getUnskipMySetupStepMutationKey,
  getUpdateMySetupGuideMutationKey,
} from '@/api/generated/api';

export const setupGuideMutationKeys = new Set<unknown>([
  getUpdateMySetupGuideMutationKey()[0],
  getSkipMySetupStepMutationKey()[0],
  getUnskipMySetupStepMutationKey()[0],
]);
