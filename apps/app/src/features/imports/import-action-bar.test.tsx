import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportActionBar, type ImportSaveState } from './import-action-bar';

const saved = (): ImportSaveState => ({
  saving: false,
  error: null,
  conflict: false,
  retry: vi.fn(),
  reload: vi.fn(),
});

function ReviewBar({ save }: { save: ImportSaveState }) {
  return (
    <>
      <label>
        Durata de utilizare
        <input />
      </label>
      <ImportActionBar
        label="Verificarea importului"
        save={save}
        summary={
          <>
            <button type="button">2 date lipsă</button>
            <button type="button">1 alegere</button>
          </>
        }
        note="Clientul se creează după confirmare."
      >
        <button type="button">Înapoi</button>
        <button type="button">Continuă</button>
      </ImportActionBar>
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('the import action bar', () => {
  it('keeps unresolved choices and missing data visible while saving completes', () => {
    const state = saved();
    const { rerender } = render(<ReviewBar save={{ ...state, saving: true }} />);

    const bar = screen.getByRole('region', { name: 'Verificarea importului' });
    expect(within(bar).getByRole('button', { name: '2 date lipsă' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: '1 alegere' })).toBeTruthy();
    expect(within(bar).getByRole('status').textContent).toBe('Se salvează…');
    expect(within(bar).queryByText('Salvat în propunere')).toBeNull();

    rerender(<ReviewBar save={state} />);

    expect(within(bar).getByRole('status').textContent).toBe('Salvat în propunere');
    expect(within(bar).getByRole('button', { name: '2 date lipsă' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: '1 alegere' })).toBeTruthy();
  });

  it.each([
    {
      name: 'failed save',
      change: { error: 'Nu am putut salva.', conflict: false },
      label: 'Ultima schimbare nu s-a salvat.',
      action: 'Salvează din nou',
      callback: 'retry' as const,
    },
    {
      name: 'concurrent change',
      change: { error: null, conflict: true },
      label: 'Propunerea s-a schimbat. Schimbarea ta nu s-a salvat.',
      action: 'Reîncarcă propunerea',
      callback: 'reload' as const,
    },
  ])(
    'shows $name beside review issues and offers recovery',
    async ({ change, label, action, callback }) => {
      const state = { ...saved(), saving: true, ...change };
      render(<ReviewBar save={state} />);

      expect(screen.getByRole('status').textContent).toBe(label);
      expect(screen.queryByText('Salvat în propunere')).toBeNull();
      expect(screen.queryByText('Se salvează…')).toBeNull();
      expect(screen.getByRole('button', { name: '2 date lipsă' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '1 alegere' })).toBeTruthy();

      await userEvent.click(screen.getByRole('button', { name: action }));

      expect(state[callback]).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: '2 date lipsă' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '1 alegere' })).toBeTruthy();
    }
  );

  it('keeps save recovery and review counts above the phone keyboard while navigation is collapsed', async () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, width: 390, offsetTop: 0 });
    vi.stubGlobal('visualViewport', viewport);
    const media = window.matchMedia('(pointer: coarse)');
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ ...media, media: query, matches: query === '(pointer: coarse)' }))
    );
    const state = saved();
    const { rerender } = render(<ReviewBar save={{ ...state, saving: true }} />);

    act(() => screen.getByRole('textbox', { name: 'Durata de utilizare' }).focus());
    act(() => {
      viewport.height = 500;
      viewport.dispatchEvent(new Event('resize'));
    });

    const bar = screen.getByRole('region', { name: 'Verificarea importului' });
    expect(bar.dataset.keyboardOpen).toBe('true');
    expect(within(bar).getByRole('button', { name: '2 date lipsă' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: '1 alegere' })).toBeTruthy();
    expect(within(bar).getByRole('status').textContent).toBe('Se salvează…');
    expect(within(bar).queryByRole('button', { name: 'Continuă' })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Înapoi' })).toBeNull();

    const field = screen.getByRole('textbox', { name: 'Durata de utilizare' });
    act(() => field.blur());
    act(() => field.focus());
    expect(bar.dataset.keyboardOpen).toBe('true');
    expect(within(bar).queryByRole('button', { name: 'Continuă' })).toBeNull();

    rerender(<ReviewBar save={{ ...state, error: 'Nu am putut salva.' }} />);
    await userEvent.click(within(bar).getByRole('button', { name: 'Salvează din nou' }));

    expect(state.retry).toHaveBeenCalledOnce();
    expect(within(bar).queryByText('Salvat în propunere')).toBeNull();

    act(() => {
      viewport.height = 844;
      viewport.dispatchEvent(new Event('resize'));
    });

    expect(within(bar).getByRole('button', { name: 'Continuă' })).toBeTruthy();
  });
});
