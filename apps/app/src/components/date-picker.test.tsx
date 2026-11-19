import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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

function Typed({ keepUnfinished }: { keepUnfinished?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <>
      <DatePicker
        id="date"
        testId="date"
        value={value}
        onChange={setValue}
        keepUnfinished={keepUnfinished}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('what a date picker reports for a typed date', () => {
  it('reports an unfinished date as empty by default, and a finished one as ISO', async () => {
    render(<Typed />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('date'), '30.09.20');
    expect(screen.getByTestId('value').textContent).toBe('');

    await user.type(screen.getByTestId('date'), '22');
    expect(screen.getByTestId('value').textContent).toBe('2022-09-30');
  });

  it('passes an unfinished date on as typed when asked to, and keeps the text on blur', async () => {
    render(<Typed keepUnfinished />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId('date'), '30.09.20');
    await user.tab();
    expect(screen.getByTestId('value').textContent).toBe('30.09.20');
    expect(screen.getByTestId<HTMLInputElement>('date').value).toBe('30.09.20');

    await user.clear(screen.getByTestId('date'));
    await user.type(screen.getByTestId('date'), '1.3.2020');
    await user.tab();
    expect(screen.getByTestId('value').textContent).toBe('2020-03-01');
    expect(screen.getByTestId<HTMLInputElement>('date').value).toBe('01.03.2020');
  });
});
