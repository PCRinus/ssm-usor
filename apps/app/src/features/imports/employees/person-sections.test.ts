import { describe, expect, it } from 'vitest';

import type { Decision } from './employee-review-model';
import { decisionStops, nextStop, sectionOnScreen } from './person-sections';

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
