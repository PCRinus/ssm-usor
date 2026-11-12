import { describe, expect, it } from 'vitest';

import type { Decision, Proposal, SheetPage } from './employee-review-model';
import { decisionStops, nextStop, ownedPages, sectionOnScreen } from './person-sections';

const order = ['decisions', 'data', 'trainings-ssm', 'trainings-su'];

describe('the section on screen', () => {
  it('is the first section, in page order, crossing the reading line', () => {
    expect(sectionOnScreen(order, new Set(['trainings-su', 'data']), false)).toBe('data');
  });

  it('is the last section at the bottom of the page, even an empty one never crossing the line', () => {
    expect(sectionOnScreen(order, new Set(['trainings-ssm']), true)).toBe('trainings-su');
  });

  it('is none while no section crosses the line, so the one before stays', () => {
    expect(sectionOnScreen(order, new Set(), false)).toBeNull();
  });
});

const decision = (key: string): Decision => ({
  key,
  anchor: 'match',
  label: key,
  tag: key,
  tone: 'destructive',
});

describe('the stops of the badge in the bar', () => {
  const page = document.createElement('div');
  const place = (id: string) => {
    const element = document.createElement('div');
    element.id = id;
    page.append(element);
    return element;
  };
  const match = place('match');
  const post = place('post');
  const row = place('row');
  const elementOf = (each: Decision) =>
    ({ match, rehire: match, post, 'row-r1': row })[each.key] ?? null;

  it('keeps one stop for each decision, in page order, even two on the same row', () => {
    const stops = decisionStops(
      ['row-r1', 'rehire', 'post', 'match', 'gone'].map(decision),
      elementOf
    );
    expect(stops.map((stop) => stop.key)).toEqual(['rehire', 'match', 'post', 'row-r1']);
  });

  it('goes through every stop and starts again after the last', () => {
    const stops = decisionStops(['match', 'rehire', 'post'].map(decision), elementOf);
    const visited: string[] = [];
    let last: string | null = null;
    for (let step = 0; step < 4; step += 1) {
      last = nextStop(stops, last)!.key;
      visited.push(last);
    }
    expect(visited).toEqual(['match', 'rehire', 'post', 'match']);
  });

  it('starts from the first stop when the last one was decided meanwhile', () => {
    const stops = decisionStops(['post'].map(decision), elementOf);
    expect(nextStop(stops, 'match')?.key).toBe('post');
    expect(nextStop([], null)).toBeNull();
  });
});

describe("a person's photos", () => {
  const sheet = (id: string, kind: SheetPage['kind'], dates: (string | null)[] = []) =>
    ({
      id,
      kind,
      personId: 'ana',
      rows: dates.map((heldOn) => ({ heldOn })),
    }) as unknown as SheetPage;
  const proposal = (pages: SheetPage[]) => ({ pages }) as unknown as Proposal;
  const ids = (pages: SheetPage[]) => pages.map((page) => page.id);

  it('read as the sheets do: each cover, then its pages by their first date', () => {
    const pages = [
      sheet('su-2022', 'su_periodic', ['2022-03-01']),
      sheet('ssm-first', 'ssm_sheet_front', ['2021-05-02']),
      sheet('ssm-2022', 'ssm_periodic', [null, '2022-09-06', '2022-03-07']),
      sheet('declaration', 'commute_declaration'),
      sheet('su-cover', 'su_sheet_front'),
      sheet('ssm-cover', 'ssm_sheet_front'),
      sheet('unread', null),
      sheet('ssm-2021', 'ssm_periodic', ['2021-09-06']),
      sheet('ssm-blank', 'ssm_periodic', [null]),
    ];
    expect(ids(ownedPages(proposal(pages), {}, 'ana'))).toEqual([
      'ssm-cover',
      'ssm-first',
      'ssm-2021',
      'ssm-2022',
      'ssm-blank',
      'su-cover',
      'su-2022',
      'declaration',
      'unread',
    ]);
  });

  it('keep the upload order between pages the sheets cannot tell apart, and follow a moved page', () => {
    const pages = [
      sheet('b', 'ssm_periodic'),
      sheet('a', 'ssm_periodic'),
      { ...sheet('elsewhere', 'ssm_sheet_front'), personId: 'ion' },
    ];
    expect(
      ids(
        ownedPages(
          proposal(pages),
          { elsewhere: { personId: 'ana' }, a: { personId: null } },
          'ana'
        )
      )
    ).toEqual(['elsewhere', 'b']);
    expect(ids(ownedPages(proposal(pages), {}, 'ana'))).toEqual(['b', 'a']);
  });
});
