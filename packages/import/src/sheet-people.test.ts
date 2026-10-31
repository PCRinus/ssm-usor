import { describe, expect, it } from 'vitest';

import { nearName, placePages } from './sheet-people';
import {
  cnps,
  comanFire,
  comanFront,
  comanPeriodic,
  otherPhoto,
  page,
  pagesOf,
  row,
  rusuFront,
  tomaFront,
  tomaPeriodic,
} from './test/sheets';

describe('nearName', () => {
  it('joins a misread letter and a given name cut short', () => {
    expect(nearName('toma andrei mihai', 'tomma andrei')).toBe(true);
    expect(nearName('coman daniela', 'coman daniella')).toBe(true);
  });

  it('keeps apart another surname and too few shared names', () => {
    expect(nearName('coman daniela', 'toma daniela')).toBe(false);
    expect(nearName('pop ana maria', 'pop elena ioana')).toBe(false);
    expect(nearName('pop ana', 'pip ana')).toBe(false);
  });
});

describe('placePages', () => {
  it('groups pages by CNP, name and near name, and a nameless page after the one before it', () => {
    const placed = placePages(
      pagesOf(comanFront, comanPeriodic, comanFire, tomaFront, tomaPeriodic)
    );

    expect(placed.groups).toEqual([
      ['page-1', 'page-2', 'page-3'],
      ['page-4', 'page-5'],
    ]);
    expect([...placed.placements.values()].map((each) => each.placement)).toEqual([
      'new_person',
      'placed_by_order',
      'name',
      'new_person',
      'near_name',
    ]);
  });

  it('leaves unplaced a page before anyone, one that could not be read and one with nothing on it', () => {
    const placed = placePages(pagesOf(comanPeriodic, null, comanFront, otherPhoto));

    expect(placed.groups).toEqual([['page-3']]);
    expect(placed.placements.get('page-1')).toEqual({ group: null, placement: 'unplaced' });
    expect(placed.placements.get('page-2')).toEqual({ group: null, placement: 'unplaced' });
    expect(placed.placements.get('page-4')).toEqual({ group: null, placement: 'unplaced' });
  });

  it('keeps apart two people of one name with different CNPs, and joins pages by CNP alone', () => {
    const namesake = page({
      pageKind: 'ssm_sheet_front',
      person: { lastName: 'Coman', firstName: 'Daniela', cnp: cnps.rusu },
    });
    const byCnp = page({ pageKind: 'psi_sheet_front', person: { cnp: cnps.coman } });
    const placed = placePages(pagesOf(comanFront, namesake, byCnp));

    expect(placed.groups).toEqual([['page-1', 'page-3'], ['page-2']]);
    expect(placed.placements.get('page-3')!.placement).toBe('cnp');
  });

  it('joins a nameless page by its employee number, over the page before it', () => {
    const byNumber = page({
      pageKind: 'ssm_periodic',
      person: { employeeNumber: '12' },
      trainings: [row({ heldOn: '2026-01-12' })],
    });
    const placed = placePages(pagesOf(comanFront, tomaFront, byNumber));

    expect(placed.groups).toEqual([['page-1', 'page-3'], ['page-2']]);
    expect(placed.placements.get('page-3')).toEqual({ group: 0, placement: 'employee_number' });
  });

  it('takes a CNP with an unreadable digit for no CNP', () => {
    const placed = placePages(
      pagesOf(rusuFront, page({ person: { lastName: 'Rusu', firstName: 'Alina' } }))
    );

    expect(placed.groups).toEqual([['page-1', 'page-2']]);
  });
});
