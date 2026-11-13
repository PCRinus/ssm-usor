import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DatePicker } from './date-picker';

function calendarOf(personal: boolean) {
  render(
    <DatePicker
      id="date"
      testId="date"
      value="1985-03-12"
      onChange={() => undefined}
      personal={personal}
    />
  );
  return userEvent.setup().click(screen.getByTestId('date-calendar'));
}

describe('what a session replay of a date picker shows', () => {
  it('leaves out the calendar of a person’s date', async () => {
    await calendarOf(true);

    expect(screen.getByRole('dialog').closest('[data-no-replay]')).not.toBeNull();
  });

  it('keeps the calendar of any other date', async () => {
    await calendarOf(false);

    expect(screen.getByRole('dialog').closest('[data-no-replay]')).toBeNull();
  });
});
