import { Button } from '@ssm-usor/ui/components/button';
import { DialogContent, DialogTitle } from '@ssm-usor/ui/components/dialog';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useCloseGuard, useHoldOpen } from './close-guard';
import { FormDialog } from './form-dialog';

function SaveForm({ save }: { save: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useHoldOpen(busy);

  async function submit() {
    setBusy(true);
    try {
      await save();
    } catch {
      setError('Nu am putut salva.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent data-testid="thing-dialog">
      <DialogTitle>Lucru</DialogTitle>
      <Button onClick={() => void submit()}>{busy ? 'Se salvează…' : 'Salvează'}</Button>
      {error && <p data-testid="thing-error">{error}</p>}
    </DialogContent>
  );
}

function deferred() {
  let reject: (cause: Error) => void = () => undefined;
  const promise = new Promise<void>((_, fail) => {
    reject = fail;
  });
  return { promise, reject };
}

describe('FormDialog', () => {
  it('stays open on Escape, an outside click and the close button while its form saves', async () => {
    const pending = deferred();
    const onClose = vi.fn();
    render(
      <FormDialog open onClose={onClose}>
        <SaveForm save={() => pending.promise} />
      </FormDialog>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(screen.getByRole('button', { name: 'Se salvează…' })).toBeTruthy();

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Închide' }));
    const overlay = document.querySelector('[data-slot=dialog-overlay]');
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);
    expect(onClose).not.toHaveBeenCalled();

    pending.reject(new Error('offline'));
    expect((await screen.findByTestId('thing-error')).textContent).toBe('Nu am putut salva.');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes when nothing saves', async () => {
    const onClose = vi.fn();
    render(
      <FormDialog open onClose={onClose}>
        <SaveForm save={vi.fn()} />
      </FormDialog>
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Închide' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('lets go when a form swapped out mid-save leaves', async () => {
    const onClose = vi.fn();
    function Swapping() {
      const [shown, setShown] = useState(true);
      return (
        <FormDialog open onClose={onClose}>
          {shown ? (
            <SaveForm save={() => new Promise(() => undefined)} />
          ) : (
            <DialogContent data-testid="other-dialog">
              <DialogTitle>Altul</DialogTitle>
            </DialogContent>
          )}
          <button type="button" onClick={() => setShown(false)}>
            Schimbă
          </button>
        </FormDialog>
      );
    }
    render(<Swapping />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Salvează' }));
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    // Outside the content, the modal dialog keeps pointer events off it.
    fireEvent.click(screen.getByRole('button', { name: 'Schimbă', hidden: true }));
    await waitFor(() => expect(screen.getByTestId('other-dialog')).toBeTruthy());
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('useCloseGuard', () => {
  it('cancels a close it refuses, so a swiped drawer settles back open', async () => {
    const onClose = vi.fn();
    const cancel = vi.fn();
    function Probe() {
      const { savingRef, onOpenChange } = useCloseGuard(onClose);
      function close(saving: boolean) {
        savingRef.current = saving;
        onOpenChange(false, { cancel });
      }
      return (
        <>
          <button type="button" onClick={() => close(true)}>
            În lucru
          </button>
          <button type="button" onClick={() => close(false)}>
            Liber
          </button>
        </>
      );
    }
    render(<Probe />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'În lucru' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Liber' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

it('refuses to run outside a guard', () => {
  function Loose() {
    useHoldOpen(false);
    return null;
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => render(<Loose />)).toThrow(/FormDialog/);
  vi.mocked(console.error).mockRestore();
});
