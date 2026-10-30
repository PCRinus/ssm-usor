import { maxFireTrainingIntervalMonths } from './checks';
import { foldText } from './match';
import { type Field, type Option, type Proposal, proposedIncluded } from './proposal';

const ownOptions = <T>(field: Field<T>) =>
  field.options.filter((option) => option.otherCompanyName === null);

const categoryScopes = [
  { category: 'technical_administrative', scope: 'administrative', other: 'worker' },
  { category: 'execution', scope: 'worker', other: 'administrative' },
] as const;

export function inferCategoriesWithoutPosts(proposal: Proposal) {
  const posts = proposal.jobPositions.filter(proposedIncluded);
  // A post without a category may be in the one that seems to have none.
  if (posts.length === 0 || posts.some((post) => post.staffCategory === null)) return;
  const schedule = proposal.trainingSchedule;
  for (const { category, scope, other } of categoryScopes) {
    const notApplicable = schedule[`${scope}TrainingNotApplicable`];
    if (
      schedule[`${scope}TrainingIntervalMonths`].options.length === 0 &&
      notApplicable.options.length === 0 &&
      ownOptions(schedule[`${other}TrainingIntervalMonths`]).length > 0 &&
      !posts.some((post) => post.staffCategory === category)
    ) {
      notApplicable.options.push({
        value: 'true',
        sources: [],
        otherCompanyName: null,
        inferred: 'no_posts_in_category',
      });
    }
  }
}

const calendarFields = ['trainingFirstMonth', 'trainingDayFrom', 'trainingDayTo'] as const;

const intervalFields = [
  'administrativeTrainingIntervalMonths',
  'workerTrainingIntervalMonths',
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
  for (const name of intervalFields) {
    const own = ownOptions(ssm[name]);
    if (
      fire[name].options.length === 0 &&
      own.length === 1 &&
      own[0]!.value <= maxFireTrainingIntervalMonths
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

export function inferValues(proposal: Proposal): Proposal {
  inferCategoriesWithoutPosts(proposal);
  inferFireTrainingFromSsm(proposal);
  inferOfficePosts(proposal);
  return proposal;
}
