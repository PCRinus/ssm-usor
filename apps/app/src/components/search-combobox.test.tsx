import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { replayedInput, replayedText } from '@/test/replay';

import { SearchCombobox } from './search-combobox';

function Picker({ personal, value = '' }: { personal?: boolean; value?: string }) {
  return (
    <SearchCombobox
      id="picker"
      testId="picker"
      items={[{ value: 'one', label: 'Popescu Ion', description: 'Sudor' }]}
      value={value}
      onChange={() => undefined}
      filter={() => 1}
      placeholder="Alege"
      searchPlaceholder="Caută"
      emptyMessage="Nimic"
      clearLabel="Golește"
      personal={personal}
    />
  );
}

describe('what a session replay of a picker shows', () => {
  it('masks the people a picker of people lists, and what is typed to find one', async () => {
    const user = userEvent.setup();
    render(<Picker personal value="one" />);

    expect(replayedText(screen.getByTestId('picker'))).toBe('******* ***Sudor');
    await user.click(screen.getByTestId('picker'));
    const search = screen.getByTestId<HTMLInputElement>('picker-search');
    await user.type(search, 'Pop');

    expect(replayedInput(search)).toBe('***');
    expect(replayedText(screen.getByRole('option', { name: /Sudor/ }))).toBe('******* ***Sudor');
  });

  it('shows the organization’s items and what is typed to find one', async () => {
    const user = userEvent.setup();
    render(<Picker />);

    await user.click(screen.getByTestId('picker'));
    const search = screen.getByTestId<HTMLInputElement>('picker-search');
    await user.type(search, 'Sud');

    expect(replayedInput(search)).toBe('Sud');
    expect(replayedText(screen.getByRole('option', { name: /Sudor/ }))).toBe('Popescu IonSudor');
  });
});
