import { offeredTrainingInterval } from '@ssm-usor/contracts';

import { foldText } from './match';
import { type Field, type Option, type Proposal, type Source } from './proposal';

const ownOptions = <T>(field: Field<T>) =>
  field.options.filter((option) => option.otherCompanyName === null);

const calendarFields = ['trainingFirstMonth', 'trainingDayFrom', 'trainingDayTo'] as const;

const intervalFields = [
  ['administrativeTrainingIntervalMonths', 'technical_administrative'],
  ['workerTrainingIntervalMonths', 'execution'],
] as const;

const fromSsm = (option: Option<number>): Option<number> => ({
  value: option.value,
  sources: [...option.sources],
  otherCompanyName: null,
  inferred: 'ssm_training_schedule',
});

export function inferFireTrainingFromSsm(proposal: Proposal) {
  const ssm = proposal.trainingSchedule;
  const fire = proposal.fireSafety;
  for (const name of calendarFields) {
    const own = ownOptions(ssm[name]);
    if (fire[name].options.length === 0 && own.length === 1) {
      fire[name].options.push(fromSsm(own[0]!));
    }
  }
  for (const [name, category] of intervalFields) {
    const own = ownOptions(ssm[name]);
    if (
      fire[name].options.length === 0 &&
      own.length === 1 &&
      offeredTrainingInterval('su', category, own[0]!.value)
    ) {
      fire[name].options.push(fromSsm(own[0]!));
    }
  }
}

// Folded. Kept to words that leave no doubt, since a post wrongly proposed without equipment is
// worse than one the member has to decide.
export const officeWords = [
  'birou',
  'birouri',
  'activitati de birou',
  'munca de birou',
  'receptie',
  'receptioner',
  'receptionera',
  'contabil',
  'contabila',
  'contabilitate',
  'secretar',
  'secretara',
  'secretariat',
  'economist',
] as const;

// A desk post that also works on the floor, the road or a site may need equipment there. Matched
// by stem, so "depozitul", "ateliere", "șantiere" and "deplasări" count; office words stay whole.
const fieldStems = [
  'teren',
  'santier',
  'depozit',
  'atelier',
  'productie',
  'hala',
  'hale',
  'sofer',
  'deplas',
  'curaten',
  'livrar',
  'magazi',
  'montaj',
  'manipul',
  'intretiner',
] as const;

const anyWord = (words: readonly string[]) => new RegExp(`(?:^| )(?:${words.join('|')})(?: |$)`);
const anyStem = (stems: readonly string[]) => new RegExp(`(?:^| )(?:${stems.join('|')})`);

const officePattern = anyWord(officeWords);
const fieldPattern = anyStem(fieldStems);

export function describesOfficeWork(...texts: (string | null)[]) {
  const folded = foldText(texts.filter((text) => text !== null).join(' '));
  return officePattern.test(folded) && !fieldPattern.test(folded);
}

export function inferOfficePosts(proposal: Proposal) {
  for (const post of proposal.jobPositions) {
    if (
      post.needsProtectiveEquipment === null &&
      !proposal.protectiveEquipment.some((entry) => entry.jobPosition.id === post.id) &&
      describesOfficeWork(post.workZone, post.activities)
    ) {
      post.needsProtectiveEquipment = false;
      post.inferred.needsProtectiveEquipment = 'office_work';
    }
  }
}

// A registered office where the documents place nothing, beside a point of work they name, is
// likely an address where nobody works (ADR 041): suggested, never stated, so the member decides.
// The documents tie no post to a workplace, so the office's own activity and a person heading it
// stand for one.
export function suggestOfficeWithoutActivity(proposal: Proposal) {
  const own = proposal.workplaces.filter((workplace) => workplace.otherCompanyName === null);
  const office = own.find((workplace) => workplace.isRegisteredOffice);
  const points = own.filter((workplace) => !workplace.isRegisteredOffice);
  if (!office || points.length === 0) return;
  const at = (reference: { id: string | null }) => reference.id === office.id;
  const placed =
    office.rooms.length > 0 ||
    office.activity !== null ||
    Object.keys(office.fieldSources).length > 0 ||
    proposal.fireEquipment.some((equipment) => at(equipment.workplace)) ||
    proposal.fireInstallations.some((installation) => at(installation.workplace)) ||
    proposal.responsiblePersons.some((person) => at(person.workplace));
  if (placed) return;
  const sources: Source[] = [];
  for (const point of points) {
    for (const source of point.sources) {
      if (!sources.some((known) => known.file === source.file && known.quote === source.quote)) {
        sources.push(source);
      }
    }
  }
  if (sources.length === 0) return;
  office.officeHasActivity = false;
  office.suggested.officeHasActivity = sources;
}

export function inferValues(proposal: Proposal): Proposal {
  inferFireTrainingFromSsm(proposal);
  inferOfficePosts(proposal);
  suggestOfficeWithoutActivity(proposal);
  return proposal;
}
