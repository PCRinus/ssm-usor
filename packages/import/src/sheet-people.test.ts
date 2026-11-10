import { describe, expect, it } from 'vitest';

import { nearName, placePages } from './sheet-people';
import {
  cnps,
  comanFire,
  comanFront,
  comanPeriodic,
  moraruUpload,
  otherPhoto,
  page,
  pagesOf,
  row,
  rusuFront,
  today,
  tomaFront,
  tomaPeriodic,
  withControlDigit,
} from './test/sheets';

describe('nearName', () => {
  it('joins a misread letter and a given name cut short', () => {
    expect(nearName('toma andrei mihai', 'tomma andrei')).toBe(true);
    expect(nearName('coman daniela', 'coman daniella')).toBe(true);
  });

  it('joins a misread letter inside a given name, and names written in another order', () => {
    expect(nearName('coman daniela', 'coman danieia')).toBe(true);
    expect(nearName('popescu ion', 'ion popescu')).toBe(true);
    expect(nearName('popescu ion vasile', 'ion popesku')).toBe(true);
  });

  it('keeps apart given names one letter at the end tells apart, as a man’s and a woman’s', () => {
    expect(nearName('coman daniel', 'coman daniela')).toBe(false);
    expect(nearName('pop ioana', 'pop ioan')).toBe(false);
    expect(nearName('radu adrian', 'radu adriana')).toBe(false);
    expect(nearName('stan paula', 'stan paul')).toBe(false);
  });

  it('keeps apart a man’s given name and the woman’s that ends in an a instead', () => {
    expect(nearName('pop liviu', 'pop livia')).toBe(false);
    expect(nearName('marin alexandru', 'marin alexandra')).toBe(false);
    expect(nearName('moraru alexandru ionut', 'moraru pirvu alexandra ioana')).toBe(false);
    expect(nearName('moraru pirvu alexandra ioana', 'moraru alexandra')).toBe(true);
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
      pagesOf(comanFront, comanPeriodic, comanFire, tomaFront, tomaPeriodic),
      today
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
    const placed = placePages(pagesOf(comanPeriodic, null, comanFront, otherPhoto), today);

    expect(placed.groups).toEqual([['page-3']]);
    expect(placed.placements.get('page-1')).toEqual({ group: null, placement: 'unplaced' });
    expect(placed.placements.get('page-2')).toEqual({ group: null, placement: 'unplaced' });
    expect(placed.placements.get('page-4')).toEqual({ group: null, placement: 'unplaced' });
  });

  it('keeps apart a brother and a sister whose sheets carry no CNP', () => {
    const daniel = page({
      pageKind: 'ssm_sheet_front',
      person: { lastName: 'Coman', firstName: 'Daniel' },
      trainings: [row({ heldOn: '2025-07-14' })],
    });
    const daniela = page({
      pageKind: 'ssm_sheet_front',
      person: { lastName: 'Coman', firstName: 'Daniela' },
      trainings: [row({ heldOn: '2025-07-14' })],
    });
    const placed = placePages(pagesOf(daniel, daniela), today);

    expect(placed.groups).toEqual([['page-1'], ['page-2']]);
  });

  it('keeps apart two people of one name with different CNPs, and joins pages by CNP alone', () => {
    const namesake = page({
      pageKind: 'ssm_sheet_front',
      person: { lastName: 'Coman', firstName: 'Daniela', cnp: cnps.rusu },
    });
    const byCnp = page({ pageKind: 'su_sheet_front', person: { cnp: cnps.coman } });
    const placed = placePages(pagesOf(comanFront, namesake, byCnp), today);

    expect(placed.groups).toEqual([['page-1', 'page-3'], ['page-2']]);
    expect(placed.placements.get('page-3')!.placement).toBe('cnp');
  });

  it('joins a nameless page by its employee number, over the page before it', () => {
    const byNumber = page({
      pageKind: 'ssm_periodic',
      person: { employeeNumber: '12' },
      trainings: [row({ heldOn: '2026-01-12' })],
    });
    const placed = placePages(pagesOf(comanFront, tomaFront, byNumber), today);

    expect(placed.groups).toEqual([['page-1', 'page-3'], ['page-2']]);
    expect(placed.placements.get('page-3')).toEqual({ group: 0, placement: 'employee_number' });
  });

  it('takes a CNP with an unreadable digit for no CNP', () => {
    const placed = placePages(
      pagesOf(rusuFront, page({ person: { lastName: 'Rusu', firstName: 'Alina' } })),
      today
    );

    expect(placed.groups).toEqual([['page-1', 'page-2']]);
  });

  it('takes a CNP whose control digit fails for no CNP, so a misread digit splits nobody', () => {
    const misread = page({
      pageKind: 'su_sheet_front',
      person: { lastName: 'Coman', firstName: 'Daniela', cnp: `${cnps.coman.slice(0, 12)}4` },
    });
    const placed = placePages(pagesOf(comanFront, misread), today);

    expect(placed.groups).toEqual([['page-1', 'page-2']]);
    expect(placed.placements.get('page-2')!.placement).toBe('name');
  });

  it('keeps a husband and wife apart in an upload out of order, each page on its person', () => {
    const placed = placePages(moraruUpload(), today);

    expect(placed.groups).toEqual([
      ['page-1', 'page-3', 'page-5', 'page-6', 'page-7'],
      ['page-2', 'page-4', 'page-8', 'page-9', 'page-10'],
    ]);
    expect([...placed.placements.values()].map((each) => each.placement)).toEqual([
      'new_person',
      'new_person',
      'name',
      'near_name',
      'name',
      'placed_by_job_title',
      'placed_by_order',
      'placed_by_job_title',
      'placed_by_job_title',
      'placed_by_order',
    ]);
  });

  it('keeps apart two people of one name born on other days, a CNP’s date as good as a written one', () => {
    const ana = { lastName: 'Pop', firstName: 'Ana' };
    const placed = placePages(
      pagesOf(
        page({ pageKind: 'ssm_sheet_front', person: ana, fields: { birthDate: '1980-01-01' } }),
        page({ pageKind: 'other', person: { ...ana, cnp: withControlDigit('290050540789') } }),
        page({ pageKind: 'su_sheet_front', person: ana, fields: { birthDate: '05.05.1990' } })
      ),
      today
    );

    expect(placed.groups).toEqual([['page-1'], ['page-2', 'page-3']]);
    expect(placed.placements.get('page-3')!.placement).toBe('name');
  });

  it('keeps one person whose birth date is misread by one digit', () => {
    const ana = { lastName: 'Pop', firstName: 'Ana' };
    const placed = placePages(
      pagesOf(
        page({ pageKind: 'ssm_sheet_front', person: ana, fields: { birthDate: '1980-01-01' } }),
        page({ pageKind: 'su_sheet_front', person: ana, fields: { birthDate: '07.01.1980' } })
      ),
      today
    );

    expect(placed.groups).toEqual([['page-1', 'page-2']]);
  });

  it('keeps one person whose birth date is read with the day and month swapped', () => {
    const ana = { lastName: 'Pop', firstName: 'Ana' };
    const placed = placePages(
      pagesOf(
        page({ pageKind: 'ssm_sheet_front', person: ana, fields: { birthDate: '1980-03-05' } }),
        page({ pageKind: 'su_sheet_front', person: ana, fields: { birthDate: '03.05.1980' } })
      ),
      today
    );

    expect(placed.groups).toEqual([['page-1', 'page-2']]);
  });

  it('takes the birth date of a valid CNP over a misread one written beside it', () => {
    const ana = { lastName: 'Pop', firstName: 'Ana' };
    const placed = placePages(
      pagesOf(
        page({
          pageKind: 'other',
          person: { ...ana, cnp: withControlDigit('290050540789') },
          fields: { birthDate: '1961-11-11' },
        }),
        page({ pageKind: 'ssm_sheet_front', person: ana, fields: { birthDate: '05.05.1990' } })
      ),
      today
    );

    expect(placed.groups).toEqual([['page-1', 'page-2']]);
  });

  it('places a nameless page after the page before it when two people write its post', () => {
    const front = (lastName: string) =>
      page({
        pageKind: 'ssm_sheet_front',
        person: { lastName, firstName: 'Ana' },
        fields: { jobTitle: 'Vânzător' },
      });
    const placed = placePages(
      pagesOf(
        front('Pop'),
        front('Toma'),
        page({ pageKind: 'ssm_periodic', fields: { jobTitle: 'Vânzător' }, trainings: [row({})] })
      ),
      today
    );

    expect(placed.groups).toEqual([['page-1'], ['page-2', 'page-3']]);
    expect(placed.placements.get('page-3')!.placement).toBe('placed_by_order');
  });

  it('places a nameless page by the post it writes, else after the page before it', () => {
    const periodic = (jobTitle: string | null) =>
      page({ pageKind: 'ssm_periodic', fields: { jobTitle }, trainings: [row({})] });
    const placed = placePages(
      pagesOf(periodic('Vânz.'), comanFront, tomaFront, periodic('Brutar'), periodic('Patiseră')),
      today
    );

    expect(placed.groups).toEqual([
      ['page-2', 'page-5'],
      ['page-1', 'page-3', 'page-4'],
    ]);
    expect([...placed.placements.values()].map((each) => each.placement)).toEqual([
      'placed_by_job_title',
      'new_person',
      'new_person',
      'placed_by_order',
      'placed_by_job_title',
    ]);
  });

  it('joins a surname misread in two letters when the birth date is the same, not when it differs', () => {
    const front = (lastName: string, birthDate: string) =>
      page({
        pageKind: 'ssm_sheet_front',
        person: { lastName, firstName: 'Irina-Maria' },
        fields: { birthDate },
      });
    const same = placePages(
      pagesOf(front('Ganea-Stoica', '1984-02-12'), front('Gavra-Stoica', '12.02.1984')),
      today
    );
    const other = placePages(
      pagesOf(front('Ganea-Stoica', '1984-02-12'), front('Gavra-Stoica', '1991-07-30')),
      today
    );

    expect(same.groups).toEqual([['page-1', 'page-2']]);
    expect(same.placements.get('page-2')!.placement).toBe('near_name');
    expect(other.groups).toEqual([['page-1'], ['page-2']]);
  });

  it('takes a last letter read as an a for a misread when the birth date is the same', () => {
    const front = (lastName: string, birthDate: string | null) =>
      page({
        pageKind: 'ssm_sheet_front',
        person: { lastName, firstName: 'Ion' },
        fields: { birthDate },
      });

    expect(
      placePages(pagesOf(front('Popa', '1979-05-04'), front('Popu', '1979-05-04')), today).groups
    ).toEqual([['page-1', 'page-2']]);
    expect(placePages(pagesOf(front('Popa', null), front('Popu', null)), today).groups).toEqual([
      ['page-1'],
      ['page-2'],
    ]);
  });
});
