import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AttendeeChecklist } from './attendee-checklist';

const options = Array.from({ length: 40 }, (_, index) => ({
  id: `employee-${index}`,
  name: `Lucrător ${index}`,
}));

describe('AttendeeChecklist', () => {
  it.each([
    [1, '1 participant ales din 40'],
    [25, '25 de participanți aleși din 40'],
  ])('counts %i chosen attendees', (chosen, expected) => {
    render(
      <AttendeeChecklist
        id="attendees"
        options={options}
        value={options.slice(0, chosen).map((option) => option.id)}
        onChange={() => {}}
      />
    );
    expect(screen.getByTestId('training-attendees-count').textContent).toBe(expected);
  });
});
