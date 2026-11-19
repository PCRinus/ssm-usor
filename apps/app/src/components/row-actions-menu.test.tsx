import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RowActionsMenu } from './row-actions-menu';

describe('RowActionsMenu', () => {
  it('names the row it acts on and offers to edit or delete it', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <RowActionsMenu name="Stingător P6" testId="unit" onEdit={onEdit} onDelete={onDelete} />
    );

    await user.click(screen.getByRole('button', { name: 'Acțiuni pentru Stingător P6' }));
    await user.click(await screen.findByTestId('unit-edit'));
    expect(onEdit).toHaveBeenCalledOnce();

    await user.click(screen.getByTestId('unit-actions'));
    const remove = await screen.findByTestId('unit-delete');
    expect(remove.textContent).toBe('Șterge');
    await user.click(remove);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('keeps a list’s own test id for the delete item', async () => {
    const user = userEvent.setup();
    render(
      <RowActionsMenu
        name="Cască"
        testId="equipment"
        deleteTestId="equipment-remove"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByTestId('equipment-actions'));
    expect(await screen.findByTestId('equipment-remove')).toBeTruthy();
    expect(screen.queryByTestId('equipment-delete')).toBeNull();
  });
});
