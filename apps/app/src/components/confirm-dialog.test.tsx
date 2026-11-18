import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

function DeleteFlow({ deletion }: { deletion: () => Promise<void> }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    try {
      await deletion();
      setOpen(false);
    } catch {
      setError('Nu am putut șterge. Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      busy={busy}
      error={error}
      testId="thing-delete"
      title="Ștergi?"
      confirmLabel="Șterge"
      pendingLabel="Se șterge…"
      onConfirm={() => void confirm()}
      onClose={() => setOpen(false)}
    >
      Nu se poate anula.
    </ConfirmDialog>
  );
}

function deferred() {
  let reject: (cause: Error) => void = () => undefined;
  const promise = new Promise<void>((_, fail) => {
    reject = fail;
  });
  return { promise, reject };
}

describe('ConfirmDialog', () => {
  it('stays open on Escape, an outside click and the close button while its action runs', async () => {
    const pending = deferred();
    render(<DeleteFlow deletion={() => pending.promise} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('thing-delete-confirm'));
    expect(screen.getByTestId('thing-delete-confirm').textContent).toBe('Se șterge…');

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Închide' }));
    const overlay = document.querySelector('[data-slot=dialog-overlay]');
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);
    expect(screen.getByTestId('thing-delete-dialog')).toBeTruthy();

    pending.reject(new Error('offline'));
    expect((await screen.findByTestId('thing-delete-error')).textContent).toBe(
      'Nu am putut șterge. Încearcă din nou.'
    );
    expect(screen.getByTestId('thing-delete-confirm').textContent).toBe('Șterge');
  });

  it('stays busy until a returned promise settles, past the end of the request', async () => {
    let finish: () => void = () => undefined;
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        busy={false}
        testId="thing-delete"
        title="Ștergi?"
        confirmLabel="Șterge"
        pendingLabel="Se șterge…"
        onConfirm={() =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
        }
        onClose={onClose}
      >
        Nu se poate anula.
      </ConfirmDialog>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('thing-delete-confirm'));
    const confirm = screen.getByTestId<HTMLButtonElement>('thing-delete-confirm');
    expect(confirm.textContent).toBe('Se șterge…');
    expect(confirm.disabled).toBe(true);
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(confirm.textContent).toBe('Șterge'));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape when nothing runs', async () => {
    render(<DeleteFlow deletion={vi.fn()} />);
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('thing-delete-dialog')).toBeNull());
  });
});
