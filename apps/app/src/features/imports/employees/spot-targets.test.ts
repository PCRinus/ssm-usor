import { describe, expect, it } from 'vitest';

import { employeeProposal } from '@/test/employee-import-fixture';

import type { SheetPage } from './employee-review-model';
import { fieldTarget, rowTarget, spotBox } from './spot-targets';

describe('the box a value is lit by', () => {
  it('names the family and the given name by the name, and the rest by their field', () => {
    expect(fieldTarget('lastName')).toBe('person.name');
    expect(fieldTarget('firstName')).toBe('person.name');
    expect(fieldTarget('cnp')).toBe('person.cnp');
    expect(fieldTarget('employeeNumber')).toBe('person.employeeNumber');
    expect(fieldTarget('homeAddress')).toBe('fields.homeAddress');
    expect(fieldTarget('commuteMinutes')).toBe('fields.commuteMinutes');
  });

  it("names a training row by its place among the page's rows", () => {
    const page = employeeProposal().pages[1] as unknown as SheetPage;
    expect(rowTarget(page, 'r2')).toBe('trainings[0]');
    expect(rowTarget(page, 'r5')).toBe('trainings[1]');
    expect(rowTarget(page, 'r1')).toBeNull();
  });

  it("finds a row not boxed whole by its cells' boxes together", () => {
    const cell = (target: string, top: number, left: number) => ({
      target,
      top,
      left,
      bottom: top + 20,
      right: left + 100,
    });
    const locations = [
      cell('trainings[1].heldOn', 400, 40),
      cell('trainings[1].trainerName', 410, 600),
      cell('trainings[10].heldOn', 900, 40),
    ];
    expect(spotBox(locations, 'trainings[1]')).toEqual({
      top: 400,
      left: 40,
      bottom: 430,
      right: 700,
    });
    expect(spotBox(locations, 'trainings[2]')).toBeNull();
    expect(spotBox(locations, 'fields.birthDate')).toBeNull();
    expect(spotBox(null, 'trainings[1]')).toBeNull();
  });
});
