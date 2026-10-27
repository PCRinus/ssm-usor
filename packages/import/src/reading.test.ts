import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { proposalChoices } from './proposal';
import { fromWire, readingAnswer, toProposal } from './reading';
import { wireAnswer } from './test/fixtures';

describe('fromWire', () => {
  const proposal = fromWire(wireAnswer());

  it('merges values that differ only in diacritics and keeps every source', () => {
    expect(proposal.client.legalName.options).toEqual([
      {
        value: 'BRUTĂRIA FICTIVĂ S.R.L.',
        sources: [
          { file: 'Dosar/Decizia 1.docx', quote: 'BRUTĂRIA FICTIVĂ S.R.L.' },
          { file: 'Dosar/PSI/Lista mijloace.doc', quote: 'BRUTĂRIA FICTIVĂ S.R.L.' },
        ],
        otherCompanyName: null,
      },
    ]);
  });

  it('turns documents that disagree into a choice, marking another company’s value', () => {
    expect(proposalChoices(proposal)).toEqual([
      {
        path: 'client.legalRepresentativeName',
        options: [
          expect.objectContaining({ value: 'Vasilescu Andrei', otherCompanyName: null }),
          expect.objectContaining({
            value: 'Petrescu Ion',
            otherCompanyName: 'ATELIERUL INVENTAT S.R.L.',
          }),
        ],
      },
    ]);
  });

  it('normalises the CUI, the county and the numbers', () => {
    expect(proposal.client.cui.options[0]!.value).toBe('12345674');
    expect(proposal.client.countyCode.options[0]!.value).toBe('TM');
    expect(proposal.trainingSchedule.workerTrainingIntervalMonths.options[0]!.value).toBe(6);
    expect(proposal.fireEquipment[0]!.capacity).toBe(6);
    expect(proposal.client.contactName.options).toEqual([]);
  });

  it('ties equipment to its workplace and gathers the workplace’s rooms', () => {
    const [office] = proposal.workplaces;
    expect(proposal.fireEquipment.map((equipment) => equipment.workplace)).toEqual([
      { name: 'Sediu', id: office!.id },
      { name: 'Sediul', id: office!.id },
    ]);
    expect(office!.rooms).toEqual(['laborator', 'birou']);
  });

  it('gives an equipment table naming several positions to each of them', () => {
    expect(
      proposal.protectiveEquipment.map((entry) => [entry.jobPosition.name, entry.item])
    ).toEqual([
      ['Brutar', 'Mănuși termorezistente'],
      ['Vânzător', 'Mănuși termorezistente'],
    ]);
    expect(proposal.protectiveEquipment.map((entry) => entry.jobPosition.id)).toEqual(
      proposal.jobPositions.map((position) => position.id)
    );
  });

  it('reads a Romanian date, a role once, and drops blank notes', () => {
    expect(proposal.employees[0]).toMatchObject({ hiredAt: '2020-03-01', cnp: null });
    expect(proposal.responsiblePersons[0]!.roles).toEqual(['workplace_manager', 'first_aid']);
    expect(proposal.notes).toEqual(['Decizia de numire a echipei de intervenție lipsește.']);
    expect(proposal.flags).toEqual([]);
  });

  it('refuses a role outside the schema', () => {
    const answer = wireAnswer();
    answer.responsiblePersons[0]!.roles = ['site_manager'];

    expect(() => fromWire(answer)).toThrow(ZodError);
  });
});

describe('toProposal', () => {
  it('joins the readings of the documents and of a scan into one proposal', () => {
    const documents = readingAnswer.parse(wireAnswer());
    const scan = readingAnswer.parse({
      ...wireAnswer(),
      facts: [
        {
          field: 'client.tradeRegisterNumber',
          value: 'J35/456/2015',
          file: 'Dosar/Scan.pdf',
          quote: 'J35/456/2015',
          otherCompany: '',
        },
      ],
      workplaces: [],
      fireEquipment: [],
      protectiveEquipment: [],
      employees: [],
      notes: [],
    });

    const proposal = toProposal(documents, scan);

    expect(proposal.client.tradeRegisterNumber.options.map((option) => option.value)).toEqual([
      'J35/123/2015',
      'J35/456/2015',
    ]);
    expect(proposal.jobPositions.map((position) => position.id)).toEqual([
      'position-1',
      'position-2',
      'position-3',
      'position-4',
    ]);
  });
});
