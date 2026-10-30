import { describe, expect, it } from 'vitest';

import { withChecks } from './checks';
import { describesOfficeWork } from './inference';
import { fromWire } from './reading';
import { files, wireAnswer } from './test/fixtures';

type Answer = ReturnType<typeof wireAnswer>;

const decision = 'Dosar/Decizia 1.docx';

const fact = (field: string, value: string, quote: string) => ({
  field,
  value,
  file: decision,
  quote,
  otherCompany: '',
});

const categoryFact = (jobPosition: string, value: string) => ({
  jobPosition,
  field: 'staffCategory',
  value,
  file: decision,
  quote: 'la 6 luni pentru personalul de execuție',
  otherCompany: '',
});

function answerWith(change: (answer: Answer) => void) {
  const answer = wireAnswer();
  answer.facts = answer.facts.filter(
    (each) => each.field !== 'trainingSchedule.administrativeTrainingNotApplicable'
  );
  change(answer);
  return answer;
}

describe('a staff category none of the posts is in', () => {
  it('is proposed as not applicable, from no passage', () => {
    const proposal = fromWire(
      answerWith((answer) => answer.jobPositionFacts.push(categoryFact('Vânzător', 'execution')))
    );

    expect(proposal.trainingSchedule.administrativeTrainingNotApplicable.options).toEqual([
      { value: 'true', sources: [], otherCompanyName: null, inferred: 'no_posts_in_category' },
    ]);
    expect(proposal.trainingSchedule.workerTrainingNotApplicable.options).toEqual([]);
  });

  it('is left undecided while a post has no category', () => {
    const proposal = fromWire(answerWith(() => {}));

    expect(proposal.trainingSchedule.administrativeTrainingNotApplicable.options).toEqual([]);
  });

  it('is left undecided while a post is in it', () => {
    const proposal = fromWire(
      answerWith((answer) =>
        answer.jobPositionFacts.push(categoryFact('Vânzător', 'technical_administrative'))
      )
    );

    expect(proposal.trainingSchedule.administrativeTrainingNotApplicable.options).toEqual([]);
  });

  it('is left undecided without the other category’s interval', () => {
    const proposal = fromWire(
      answerWith((answer) => {
        answer.jobPositionFacts.push(categoryFact('Vânzător', 'execution'));
        answer.facts = answer.facts.filter(
          (each) => each.field !== 'trainingSchedule.workerTrainingIntervalMonths'
        );
      })
    );

    expect(proposal.trainingSchedule.administrativeTrainingNotApplicable.options).toEqual([]);
  });

  it('counts no post proposed unticked, as a management-only one', () => {
    const proposal = fromWire(
      answerWith((answer) => {
        answer.jobPositionFacts.push(categoryFact('Vânzător', 'execution'));
        answer.jobPositions.push({
          ...answer.jobPositions[1]!,
          name: 'Administrator',
          managementOnly: true,
        });
        answer.jobPositionFacts.push(categoryFact('Administrator', 'technical_administrative'));
      })
    );

    expect(proposal.trainingSchedule.administrativeTrainingNotApplicable.options).toHaveLength(1);
  });

  it('keeps what the decision says of the category', () => {
    const proposal = fromWire(
      answerWith((answer) => {
        answer.jobPositionFacts.push(categoryFact('Vânzător', 'execution'));
        answer.facts.push(
          fact(
            'trainingSchedule.administrativeTrainingIntervalMonths',
            'ANUAL',
            'personalul tehnico-administrativ anual'
          )
        );
      })
    );

    expect(proposal.trainingSchedule.administrativeTrainingNotApplicable.options).toEqual([]);
    expect(proposal.trainingSchedule.administrativeTrainingIntervalMonths.options[0]!.value).toBe(
      12
    );
  });
});

describe('the fire-safety training calendar', () => {
  const ssmCalendar = (answer: Answer) =>
    answer.facts.push(
      fact('trainingSchedule.trainingFirstMonth', '3', 'începând cu luna 3'),
      fact('trainingSchedule.trainingDayFrom', '10', 'între zilele 10 și 20'),
      fact('trainingSchedule.trainingDayTo', '20', 'între zilele 10 și 20')
    );

  it('follows the SSM one where the fire-safety documents give none, with its passages', () => {
    const proposal = fromWire(answerWith(ssmCalendar));

    expect(proposal.fireSafety.trainingFirstMonth.options).toEqual([
      {
        value: 3,
        sources: [{ file: decision, quote: 'începând cu luna 3' }],
        otherCompanyName: null,
        inferred: 'ssm_training_schedule',
      },
    ]);
    expect(proposal.fireSafety.trainingDayFrom.options[0]!.value).toBe(10);
    expect(proposal.fireSafety.trainingDayTo.options[0]!.value).toBe(20);
    expect(proposal.fireSafety.workerTrainingIntervalMonths.options).toEqual([
      expect.objectContaining({ value: 6, inferred: 'ssm_training_schedule' }),
    ]);
  });

  it('keeps what the fire-safety documents give', () => {
    const proposal = fromWire(
      answerWith((answer) => {
        ssmCalendar(answer);
        answer.facts.push(fact('fireSafety.trainingFirstMonth', '4', 'PSI: luna 4'));
        answer.facts.push(
          fact('fireSafety.workerTrainingIntervalMonths', 'TRIMESTRIAL', 'PSI execuție trimestrial')
        );
      })
    );

    const [month] = proposal.fireSafety.trainingFirstMonth.options;
    const [interval] = proposal.fireSafety.workerTrainingIntervalMonths.options;
    expect(proposal.fireSafety.trainingFirstMonth.options).toHaveLength(1);
    expect(month!.value).toBe(4);
    expect(month).not.toHaveProperty('inferred');
    expect(interval!.value).toBe(3);
    expect(interval).not.toHaveProperty('inferred');
  });

  it('takes no interval past the fire-safety range, nor from a choice', () => {
    const proposal = fromWire(
      answerWith((answer) => {
        answer.facts.push(
          fact('trainingSchedule.administrativeTrainingIntervalMonths', '12 luni', 'la 12 luni'),
          fact('trainingSchedule.workerTrainingIntervalMonths', '3 luni', 'la 3 luni')
        );
      })
    );

    expect(proposal.fireSafety.administrativeTrainingIntervalMonths.options).toEqual([]);
    expect(proposal.fireSafety.workerTrainingIntervalMonths.options).toEqual([]);
  });

  it('passes the checks on the SSM passages it was taken from', () => {
    const proposal = fromWire(answerWith(ssmCalendar));
    const text =
      'începând cu luna 3, între zilele 10 și 20, la 6 luni pentru personalul de execuție';
    const checked = withChecks(proposal, { files: { ...files, [decision]: text } });

    expect(checked.flags.filter((flag) => flag.path.startsWith('fireSafety.'))).toEqual([]);
  });
});

describe('an office post', () => {
  const withPost = (workZone: string, activities = '', needsProtectiveEquipment = '') =>
    fromWire(
      answerWith((answer) => {
        answer.jobPositions.push({
          ...answer.jobPositions[1]!,
          name: 'Contabil',
          workZone,
          needsProtectiveEquipment,
        });
        if (activities) {
          answer.jobPositionFacts.push({
            ...categoryFact('Contabil', activities),
            field: 'activities',
          });
        }
      })
    ).jobPositions.find((post) => post.name === 'Contabil')!;

  it('needs no equipment when nothing gives it some', () => {
    const post = withPost('Birou');

    expect(post.needsProtectiveEquipment).toBe(false);
    expect(post.inferred).toEqual({ needsProtectiveEquipment: 'office_work' });
  });

  it('is told by its activities too', () => {
    expect(withPost('', 'Activități de birou, recepție').needsProtectiveEquipment).toBe(false);
  });

  it('stays undecided when it also works on the floor or the road', () => {
    expect(withPost('Birou, teren').needsProtectiveEquipment).toBeNull();
    expect(withPost('Birou', 'Deplasări la clienți').needsProtectiveEquipment).toBeNull();
    expect(withPost('Atelier').needsProtectiveEquipment).toBeNull();
  });

  it('keeps what the documents decided', () => {
    const post = withPost('Birou', '', 'false');

    expect(post.needsProtectiveEquipment).toBe(false);
    expect(post.inferred).toEqual({});
  });

  it('keeps the equipment its entries give it', () => {
    const proposal = fromWire(
      answerWith((answer) => {
        answer.jobPositions[1]!.workZone = 'Birou';
      })
    );

    expect(proposal.jobPositions[1]!.needsProtectiveEquipment).toBe(true);
    expect(proposal.jobPositions[1]!.inferred).toEqual({});
  });
});

describe('describesOfficeWork', () => {
  it('folds case and diacritics and matches whole words', () => {
    expect(describesOfficeWork('BIROU')).toBe(true);
    expect(describesOfficeWork('Recepție hotel')).toBe(true);
    expect(describesOfficeWork('Contabilă')).toBe(true);
    expect(describesOfficeWork('Birourile clienților')).toBe(false);
    expect(describesOfficeWork(null, null)).toBe(false);
  });
});
