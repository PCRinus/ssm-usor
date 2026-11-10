import { describe, expect, it } from 'vitest';

import { proposalSchema } from './proposal';
import { type Reading, toProposal } from './reading';

type Entry = Reading['fireEquipment'][number];

const decision = 'Dosar/PSI/Decizia 7 dotare.docx';
const meansList = 'Dosar/PSI/Lista mijloacelor de stingere.docx';
const riskEvaluation = 'Dosar/PSI/Evaluarea riscului de incendiu.docx';

const workplace = (name: string, addressLine: string): Reading['workplaces'][number] => ({
  name,
  county: 'CJ',
  locality: 'Cluj-Napoca',
  addressLine,
  isRegisteredOffice: name === 'Sediu',
  activity: 'Restaurant',
  rooms: [],
  file: decision,
  quote: `${name}, ${addressLine}`,
  otherCompany: null,
});

const reading = (
  fireEquipment: Entry[],
  workplaces = [workplace('Sediu', 'Str. Florilor nr. 3')]
): Reading => ({
  facts: [],
  workplaces,
  workplaceFacts: [],
  workplaceSuggestions: [],
  jobPositions: [],
  jobPositionFacts: [],
  responsiblePersons: [],
  fireEquipment,
  fireInstallations: [],
  substances: [],
  protectiveEquipment: [],
  employees: [],
  notes: [],
});

const powder = (file: string, count: number | null, room: string | null = null): Entry => ({
  workplace: 'Sediu',
  room,
  kind: 'extinguisher',
  agent: 'powder',
  capacity: 6,
  wheeled: false,
  count,
  file,
  quote: `stingător P6${room ? `, ${room}` : ''}${count === null ? '' : ` – ${count} buc.`}`,
  otherCompany: null,
});

describe('one count of the means per workplace', () => {
  it('turns files whose totals differ into a choice, each with its total and its files', () => {
    const proposal = toProposal(
      reading([
        powder(decision, 4, 'bucătărie'),
        powder(decision, 1, 'bar'),
        powder(meansList, 3),
        powder(riskEvaluation, 5),
      ])
    );

    expect(proposal.fireEquipment.map((entry) => [entry.id, entry.room, entry.count])).toEqual([
      ['equipment-1', 'bucătărie', 4],
      ['equipment-2', 'bar', 1],
      ['equipment-3', null, 3],
    ]);
    expect(proposal.fireEquipmentCounts).toEqual([
      {
        id: 'count-1',
        workplace: { name: 'Sediu', id: 'workplace-1' },
        kind: 'extinguisher',
        agent: 'powder',
        capacity: 6,
        wheeled: false,
        options: [
          {
            total: 5,
            sources: [
              { file: decision, quote: 'stingător P6, bucătărie – 4 buc.' },
              { file: decision, quote: 'stingător P6, bar – 1 buc.' },
              { file: riskEvaluation, quote: 'stingător P6 – 5 buc.' },
            ],
            equipmentIds: ['equipment-1', 'equipment-2'],
          },
          {
            total: 3,
            sources: [{ file: meansList, quote: 'stingător P6 – 3 buc.' }],
            equipmentIds: ['equipment-3'],
          },
        ],
      },
    ]);
  });

  it('keeps the entries of the file that names rooms where the totals agree', () => {
    const proposal = toProposal(
      reading([
        powder(decision, 2),
        powder(meansList, 1, 'bucătărie'),
        powder(meansList, 1, 'sală'),
      ])
    );

    expect(proposal.fireEquipmentCounts).toEqual([]);
    expect(
      proposal.fireEquipment.map((entry) => [entry.id, entry.room, entry.sources[0]!.file])
    ).toEqual([
      ['equipment-1', 'bucătărie', meansList],
      ['equipment-2', 'sală', meansList],
    ]);
  });

  it('keeps the entries of the agreeing file that names the most rooms', () => {
    const proposal = toProposal(
      reading([
        powder(decision, 2, 'Birou'),
        powder(meansList, 1, 'Birou'),
        powder(meansList, 1, 'Hol'),
      ])
    );

    expect(proposal.fireEquipmentCounts).toEqual([]);
    expect(proposal.fireEquipment.map((entry) => [entry.room, entry.sources[0]!.file])).toEqual([
      ['Birou', meansList],
      ['Hol', meansList],
    ]);
    expect(proposal.workplaces[0]!.rooms).toEqual(['Birou', 'Hol']);
  });

  it('keeps the first file’s entries where agreeing files name as many rooms', () => {
    const proposal = toProposal(
      reading([powder(decision, 2, 'Birou'), powder(meansList, 2, 'Hol')])
    );

    expect(proposal.fireEquipment.map((entry) => entry.room)).toEqual(['Birou']);
  });

  it('counts an extinguisher with no capacity as the one type the workplace has', () => {
    const untyped = (file: string, count: number): Entry => ({
      ...powder(file, count),
      capacity: null,
      quote: `${count} stingătoare cu pulbere`,
    });
    const agreeing = toProposal(reading([powder(decision, 3), untyped(meansList, 3)]));
    expect(agreeing.fireEquipmentCounts).toEqual([]);
    expect(agreeing.fireEquipment.map((entry) => [entry.capacity, entry.count])).toEqual([[6, 3]]);

    const differing = toProposal(
      reading([powder(decision, 3), { ...untyped(meansList, 4), agent: null }])
    );
    expect(differing.fireEquipmentCounts).toEqual([
      expect.objectContaining({
        agent: 'powder',
        capacity: 6,
        options: [expect.objectContaining({ total: 3 }), expect.objectContaining({ total: 4 })],
      }),
    ]);
  });

  it('leaves an extinguisher with no capacity apart where the workplace has several types', () => {
    const co2 = { ...powder(decision, 1), agent: 'co2' as const, capacity: 2 };
    const untyped = { ...powder(meansList, 4), agent: null, capacity: null };
    const proposal = toProposal(reading([powder(decision, 3), co2, untyped]));

    expect(proposal.fireEquipmentCounts).toEqual([]);
    expect(proposal.fireEquipment).toHaveLength(3);
  });

  it('adds to the workplace only the rooms every option of a count names', () => {
    const proposal = toProposal(
      reading([
        powder(decision, 2, 'Bucătărie'),
        powder(decision, 1, 'Bar'),
        powder(meansList, 2, 'Bucătărie'),
        { ...powder(meansList, 1, 'Depozit'), kind: 'fire_blanket', agent: null, capacity: null },
      ])
    );

    expect(proposal.fireEquipmentCounts).toHaveLength(1);
    expect(proposal.workplaces[0]!.rooms).toEqual(['Depozit', 'Bucătărie']);
  });

  it('keeps the first file’s entries where agreeing files name no rooms', () => {
    const proposal = toProposal(reading([powder(decision, 2), powder(riskEvaluation, 2)]));

    expect(proposal.fireEquipment.map((entry) => entry.sources[0]!.file)).toEqual([decision]);
  });

  it('counts a row with no number as one unit and keeps it without a number', () => {
    const proposal = toProposal(reading([powder(decision, 1), powder(meansList, null, 'birou')]));

    expect(proposal.fireEquipmentCounts).toEqual([]);
    expect(proposal.fireEquipment).toEqual([
      expect.objectContaining({ room: 'birou', count: null }),
    ]);
  });

  it('compares only the same kind, agent, capacity and wheels at the same workplace', () => {
    const co2 = { ...powder(meansList, 1), agent: 'co2' as const, capacity: 2 };
    const wheeled = { ...powder(meansList, 1), capacity: 50, wheeled: true };
    const blanket = {
      ...powder(meansList, 1),
      kind: 'fire_blanket' as const,
      agent: null,
      capacity: null,
    };
    const atShop = { ...powder(meansList, 2), workplace: 'Magazin' };
    const proposal = toProposal(
      reading(
        [powder(decision, 3), co2, wheeled, blanket, atShop],
        [workplace('Sediu', 'Str. Florilor nr. 3'), workplace('Magazin', 'Str. Lunii nr. 8')]
      )
    );

    expect(proposal.fireEquipmentCounts).toEqual([]);
    expect(proposal.fireEquipment).toHaveLength(5);
  });

  it('reads a scanned document’s pages as one file', () => {
    const scan = 'Dosar/PSI/Lista scanată.pdf';
    const proposal = toProposal(
      reading([
        powder(decision, 3),
        powder(`${scan} (pagina 1)`, 2, 'bucătărie'),
        powder(`${scan} (pagina 2)`, 1, 'bar'),
      ])
    );

    expect(proposal.fireEquipmentCounts).toEqual([]);
    expect(proposal.fireEquipment.map((entry) => entry.room)).toEqual(['bucătărie', 'bar']);
  });

  it('places an entry with no workplace at the only workplace and counts it there', () => {
    const proposal = toProposal(
      reading([{ ...powder(decision, 3), workplace: null }, powder(meansList, 2)])
    );

    expect(proposal.fireEquipmentCounts).toHaveLength(1);
    expect(proposal.fireEquipmentCounts[0]!.options.map((option) => option.total)).toEqual([3, 2]);
  });

  it('leaves an entry with no workplace among several as read, for the member to place', () => {
    const proposal = toProposal(
      reading(
        [{ ...powder(decision, 3), workplace: null }, powder(meansList, 2)],
        [workplace('Sediu', 'Str. Florilor nr. 3'), workplace('Magazin', 'Str. Lunii nr. 8')]
      )
    );

    expect(proposal.fireEquipmentCounts).toEqual([]);
    expect(proposal.fireEquipment.map((entry) => entry.workplace)).toEqual([
      { name: null, id: null },
      { name: 'Sediu', id: 'workplace-1' },
    ]);
  });

  it('leaves out of the count what only another company’s passages give', () => {
    const proposal = toProposal(
      reading([powder(decision, 3), { ...powder(meansList, 7), otherCompany: 'ALTA FIRMĂ S.R.L.' }])
    );

    expect(proposal.fireEquipmentCounts).toEqual([]);
    expect(proposal.fireEquipment).toHaveLength(2);
  });

  it('opens a proposal stored before the means were counted once', () => {
    const stored = JSON.parse(JSON.stringify(toProposal(reading([powder(decision, 3)]))));
    delete stored.fireEquipmentCounts;

    expect(proposalSchema.parse(stored).fireEquipmentCounts).toEqual([]);
  });
});
