import { describe, expect, it } from 'vitest';

import {
  checkAllowedValues,
  checkDuplicates,
  checkIdentifiers,
  checkMissing,
  checkQuotes,
  checkReferences,
  checkRegistrations,
  lookUpRegistrations,
  withChecks,
} from './checks';
import type { Proposal } from './proposal';
import { fromWire } from './reading';
import { files, wireAnswer } from './test/fixtures';

const proposal = () => fromWire(wireAnswer());

const codes = (flags: { path: string; code: string }[]) =>
  flags.map((flag) => `${flag.path} ${flag.code}`);

describe('checkQuotes', () => {
  it('passes quotes found in their files, despite pipes, case and diacritics', () => {
    expect(checkQuotes(proposal(), files)).toEqual([]);
  });

  it('flags a quote that is not in its file, and a file that is not in the import', () => {
    const value = proposal();
    value.client.caenCode.options[0]!.sources = [
      { file: 'Dosar/Decizia 1.docx', quote: 'cod CAEN 5610' },
      { file: 'Dosar/Lipsă.docx', quote: 'cod CAEN 1071' },
    ];

    expect(checkQuotes(value, files)).toEqual([
      { path: 'client.caenCode.options.0.sources.0', code: 'quote_not_found' },
      {
        path: 'client.caenCode.options.0.sources.1',
        code: 'file_not_found',
        detail: 'Dosar/Lipsă.docx',
      },
    ]);
  });

  it('flags a file named like an object’s own property as not found', () => {
    const value = proposal();
    value.client.caenCode.options[0]!.sources = [{ file: 'constructor', quote: 'cod CAEN 1071' }];

    expect(checkQuotes(value, files)).toEqual([
      {
        path: 'client.caenCode.options.0.sources.0',
        code: 'file_not_found',
        detail: 'constructor',
      },
    ]);
  });

  it('leaves a file without text unchecked', () => {
    expect(checkQuotes(proposal(), { ...files, 'Dosar/Decizia 1.docx': null })).toEqual([]);
  });
});

describe('checkIdentifiers', () => {
  it('flags a CUI with a wrong control digit', () => {
    const value = proposal();
    value.client.cui.options.push({ ...value.client.cui.options[0]!, value: '12345675' });

    expect(codes(checkIdentifiers(value))).toEqual(['client.cui.options.1 invalid_cui']);
  });

  it('flags a CNP that fails its checksum or disagrees with the birth date', () => {
    const value = proposal();
    const employee = value.employees[0]!;
    value.employees.push(
      { ...employee, cnp: '1850315350013' },
      { ...employee, cnp: '1850315350012', birthDate: '1985-03-16' },
      { ...employee, cnp: '1850315350012', birthDate: '1985-03-15' }
    );

    expect(checkIdentifiers(value)).toEqual([
      { path: 'employees.1.cnp', code: 'invalid_cnp' },
      { path: 'employees.2.cnp', code: 'cnp_birth_date_mismatch', detail: '1985-03-15' },
    ]);
  });
});

describe('checkAllowedValues', () => {
  it('passes the values the app accepts', () => {
    expect(checkAllowedValues(proposal())).toEqual([]);
  });

  it('flags values outside the database’s enums and ranges', () => {
    const value = proposal();
    const option = value.client.countyCode.options[0]!;
    value.client.countyCode.options[0] = { ...option, value: 'Banat' };
    value.client.contactEmail.options.push({ ...option, value: 'office@' });
    value.trainingSchedule.periodicTrainingMinutes.options[0]!.value = 45;
    value.fireSafety.smokingPolicy.options[0]!.value = 'allowed';
    value.jobPositions[0]!.trainingIntervalMonths = 12;
    value.fireEquipment[0]!.kind = 'sand_box';

    expect(codes(checkAllowedValues(value))).toEqual([
      'client.countyCode.options.0 value_not_allowed',
      'client.contactEmail.options.0 value_not_allowed',
      'trainingSchedule.periodicTrainingMinutes.options.0 value_not_allowed',
      'fireSafety.smokingPolicy.options.0 value_not_allowed',
      'jobPositions.0.trainingIntervalMonths value_not_allowed',
      'fireEquipment.0.capacity value_not_allowed',
      'fireEquipment.0.agent value_not_allowed',
    ]);
  });
});

describe('checkDuplicates', () => {
  it('flags a second workplace at the same address, a position and a person twice', () => {
    const value = proposal();
    value.workplaces.push({ ...value.workplaces[0]!, id: 'workplace-3', name: 'Laborator' });
    value.jobPositions.push({ ...value.jobPositions[0]!, id: 'position-3', name: ' BRUTAR ' });
    value.responsiblePersons.push({
      ...value.responsiblePersons[0]!,
      id: 'person-2',
      fullName: 'Maria Ionescu',
    });

    expect(checkDuplicates(value)).toEqual([
      { path: 'workplaces.2', code: 'duplicate', detail: 'workplaces.0' },
      { path: 'jobPositions.2', code: 'duplicate', detail: 'jobPositions.0' },
      { path: 'responsiblePersons.1', code: 'duplicate', detail: 'responsiblePersons.0' },
    ]);
  });

  it('does not flag two employees of one name whose CNPs differ', () => {
    const value = proposal();
    const employee = value.employees[0]!;
    value.employees = [
      { ...employee, cnp: '2850315350016' },
      { ...employee, id: 'employee-2', cnp: '2900101350010' },
      { ...employee, id: 'employee-3', cnp: null },
    ];

    expect(checkDuplicates(value)).toEqual([
      { path: 'employees.2', code: 'duplicate', detail: 'employees.0' },
    ]);
  });
});

describe('checkMissing', () => {
  it('flags a missing identity, unless the client exists, and an employee’s missing values', () => {
    const value: Proposal = proposal();
    value.client.cui.options = [];
    value.client.legalName.options = value.client.legalName.options.map((option) => ({
      ...option,
      otherCompanyName: 'ATELIERUL INVENTAT S.R.L.',
    }));
    value.employees[0] = { ...value.employees[0]!, hiredAt: null, firstName: null };

    expect(codes(checkMissing(value))).toEqual([
      'client.legalName missing',
      'client.cui missing',
      'employees.0.firstName missing',
      'employees.0.hiredAt missing',
    ]);
    expect(codes(checkMissing(value, { clientExists: true }))).toEqual([
      'employees.0.firstName missing',
      'employees.0.hiredAt missing',
    ]);
  });

  it('leaves out the legal representative, whom an employee is proposed unticked for', () => {
    const value: Proposal = proposal();
    value.employees.push({
      ...value.employees[0]!,
      id: 'employee-2',
      role: 'legal_representative',
      lastName: 'Vasilescu',
      firstName: 'Andrei',
      jobTitle: 'administrator',
      hiredAt: null,
    });

    expect(codes(checkMissing(value))).toEqual([]);
  });
});

describe('checkReferences', () => {
  it('flags a reference to a workplace or position the proposal lacks', () => {
    const value = proposal();
    value.protectiveEquipment[0]!.jobPosition = { name: 'Patiser', id: null };
    value.responsiblePersons[0]!.workplace = { name: 'Depozit', id: null };

    expect(checkReferences(value)).toEqual([
      { path: 'responsiblePersons.0.workplace', code: 'unknown_reference', detail: 'Depozit' },
      { path: 'protectiveEquipment.0.jobPosition', code: 'unknown_reference', detail: 'Patiser' },
    ]);
  });
});

describe('registrations', () => {
  it('flags a CUI the registry does not know and a name that differs from the registry’s', async () => {
    const value = proposal();
    value.client.cui.options.push({ ...value.client.cui.options[0]!, value: '31415920' });
    const registry = {
      lookup: async (cui: string) => {
        if (cui === '12345674') return { cui, legalName: 'PANIFICAȚIE EXEMPLU SRL' };
        return null;
      },
    };

    const registrations = await lookUpRegistrations(value, registry);

    expect(checkRegistrations(value, registrations)).toEqual([
      { path: 'client.legalName', code: 'legal_name_differs', detail: 'PANIFICAȚIE EXEMPLU SRL' },
      { path: 'client.cui.options.1', code: 'cui_not_registered' },
    ]);
  });

  it('leaves a CUI unconfirmed when the registry cannot answer', async () => {
    const registrations = await lookUpRegistrations(proposal(), {
      lookup: () => Promise.reject(new Error('ANAF is down')),
    });

    expect(checkRegistrations(proposal(), registrations)).toEqual([]);
  });
});

describe('withChecks', () => {
  it('records every check’s flags on the proposal', () => {
    const answer = wireAnswer();
    answer.employees[0]!.hiredAt = '';

    const checked = withChecks(fromWire(answer), {
      files,
      registrations: new Map([
        ['12345674', { cui: '12345674', legalName: 'Brutăria Fictivă SRL' }],
      ]),
    });

    expect(checked.flags).toEqual([{ path: 'employees.0.hiredAt', code: 'missing' }]);
  });
});
