import { describe, expect, it } from 'vitest';

import { attendeeCountLabel } from './training-format';

describe('attendeeCountLabel', () => {
  it.each([
    [1, '1 participant'],
    [2, '2 participanți'],
    [19, '19 participanți'],
    [20, '20 de participanți'],
    [25, '25 de participanți'],
    [101, '101 participanți'],
    [120, '120 de participanți'],
  ])('counts %i attendees', (count, expected) => {
    expect(attendeeCountLabel(count)).toBe(expected);
  });
});
