import type { LegalRepresentativeRef } from '@ssm-usor/contracts';

import { type Identified, samePerson } from './people';

export type TrainerChain<Manager extends Identified> = {
  managers: readonly Manager[];
  legalRepresentative: Identified | null;
  /** The provider's specialist, or the fire-safety technician for the fire-safety trainings. */
  specialist: Identified | null;
};

export type ResolvedTrainer<Manager extends Identified> =
  | { kind: 'managers'; managers: Manager[] }
  | { kind: 'legal_representative' }
  | { kind: 'specialist' };

// Nobody trains themself: the heads of the workplaces train the others, so in a firm where the
// head is the only trainee the legal representative steps in, and where that is the same
// person again, the provider's specialist, who trains the heads anyway. A head who is one of
// several trainees still trains the group.
export function resolveTrainer<Manager extends Identified>(
  trainees: readonly Identified[],
  chain: TrainerChain<Manager>,
  legalRepresentative: LegalRepresentativeRef
): ResolvedTrainer<Manager> | null {
  const self = (candidate: Identified) =>
    trainees.length > 0 &&
    trainees.every((trainee) => samePerson(candidate, trainee, legalRepresentative));
  const managers = chain.managers.filter((manager) => !self(manager));
  if (managers.length > 0) return { kind: 'managers', managers };
  if (chain.legalRepresentative && !self(chain.legalRepresentative)) {
    return { kind: 'legal_representative' };
  }
  if (chain.specialist && !self(chain.specialist)) return { kind: 'specialist' };
  return null;
}
