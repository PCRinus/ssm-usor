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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the import action bar', () => {
  it('stays above the footer at the content boundary, including after content resizes', () => {
    vi.stubGlobal('innerHeight', 800);
    let bottom = 1200;
    let resize = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.tagName === 'MAIN') return new DOMRect(200, bottom - 1200, 600, 1200);
      return new DOMRect(200, 0, 600, this.hasAttribute('data-import-action-bar') ? 80 : 0);
    });
    const previousPadding = document.documentElement.style.scrollPaddingBottom;
    const { unmount } = render(
      <>
        <main>
          <ReviewBar save={saved()} />
        </main>
        <footer>© SSM Ușor</footer>
      </>
    );
    const bar = screen.getByRole('region', { name: 'Verificarea importului' });
    expect(bar.style.bottom).toBe('0px');

    act(() => {
      bottom = 750;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(bar.style.bottom).toBe('50px');
    expect(document.documentElement.style.scrollPaddingBottom).toBe('146px');

    act(() => {
      bottom = 720;
      resize();
    });
    expect(bar.style.bottom).toBe('80px');

    act(() => {
      bottom = 1000;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(bar.style.bottom).toBe('0px');

    unmount();
    expect(document.documentElement.style.scrollPaddingBottom).toBe(previousPadding);
  });

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
      label: 'Ultima schimbare nu s-a salvat. Nu am putut salva.',
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
    vi.stubGlobal('innerHeight', 844);
    const rectangle = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.tagName === 'MAIN' ? new DOMRect(0, 0, 390, 780) : rectangle.call(this);
    });
    const viewport = Object.assign(new EventTarget(), { height: 844, width: 390, offsetTop: 0 });
    vi.stubGlobal('visualViewport', viewport);
    const media = window.matchMedia('(pointer: coarse)');
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ ...media, media: query, matches: query === '(pointer: coarse)' }))
    );
    const state = saved();
    const { rerender } = render(
      <main>
        <ReviewBar save={{ ...state, saving: true }} />
      </main>
    );

    act(() => screen.getByRole('textbox', { name: 'Durata de utilizare' }).focus());
    act(() => {
      viewport.height = 500;
      viewport.dispatchEvent(new Event('resize'));
    });

    const bar = screen.getByRole('region', { name: 'Verificarea importului' });
    expect(bar.dataset.keyboardOpen).toBe('true');
    expect(bar.style.bottom).toBe('344px');
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

    rerender(
      <main>
        <ReviewBar save={{ ...state, error: 'Nu am putut salva.' }} />
      </main>
    );
    await userEvent.click(within(bar).getByRole('button', { name: 'Salvează din nou' }));

    expect(state.retry).toHaveBeenCalledOnce();
    expect(within(bar).queryByText('Salvat în propunere')).toBeNull();

    act(() => {
      viewport.height = 844;
      viewport.dispatchEvent(new Event('resize'));
    });

    expect(within(bar).getByRole('button', { name: 'Continuă' })).toBeTruthy();
    expect(bar.style.bottom).toBe('64px');
  });

  it.each([
    { name: 'saved', change: {} },
    { name: 'failed', change: { error: 'Nu am putut salva.' } },
  ])('lays out a bar without leading content as before ($name)', ({ change }) => {
    render(<ReviewBar save={{ ...saved(), ...change }} />);
    expect(
      screen.getByRole('region', { name: 'Verificarea importului' }).outerHTML
    ).toMatchSnapshot();
  });
});

function PersonBar({ save }: { save: ImportSaveState }) {
  return (
    <ImportActionBar
      label="Verificarea persoanei"
      save={save}
      leading={<div role="group" aria-label="Fotografiile persoanei" />}
      summary={<button type="button">4 de hotărât</button>}
    >
      <button type="button">Persoana următoare</button>
    </ImportActionBar>
  );
}

describe('the import action bar with leading content', () => {
  it('shows the leading content first, the summary above the save status, and the buttons last', () => {
    render(<PersonBar save={saved()} />);
    const bar = screen.getByRole('region', { name: 'Verificarea persoanei' });
    const order = [
      within(bar).getByRole('group', { name: 'Fotografiile persoanei' }),
      within(bar).getByRole('button', { name: '4 de hotărât' }),
      within(bar).getByRole('status'),
      within(bar).getByRole('button', { name: 'Persoana următoare' }),
    ];
    for (const [index, element] of order.entries()) {
      const next = order[index + 1];
      if (next)
        expect(
          element.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
    }
    expect(within(bar).getByRole('status').textContent).toBe('Salvat în propunere');
  });

  it('announces a failed save as an alert and offers to save again beside the summary', async () => {
    const state = { ...saved(), error: 'Nu am putut salva.' };
    render(<PersonBar save={state} />);
    const bar = screen.getByRole('region', { name: 'Verificarea persoanei' });
    const alert = within(bar).getByRole('alert');
    expect(alert.textContent).toBe('Ultima schimbare nu s-a salvat. Nu am putut salva.');
    expect(alert.title).toBe('Nu am putut salva.');
    const retry = within(bar).getByRole('button', { name: 'Salvează din nou' });
    expect(retry.parentElement).toBe(
      within(bar)
        .getByRole('button', { name: '4 de hotărât' })
        .closest('[data-testid="import-action-summary"]')!.parentElement
    );
    await userEvent.click(retry);
    expect(state.retry).toHaveBeenCalledOnce();
    expect(within(bar).getByRole('button', { name: 'Persoana următoare' })).toBeTruthy();
  });

  it('keeps only the summary and the save status above the phone keyboard', () => {
    vi.stubGlobal('innerHeight', 844);
    const viewport = Object.assign(new EventTarget(), { height: 844, width: 390, offsetTop: 0 });
    vi.stubGlobal('visualViewport', viewport);
    const media = window.matchMedia('(pointer: coarse)');
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ ...media, media: query, matches: query === '(pointer: coarse)' }))
    );
    render(
      <main>
        <label>
          Altă valoare
          <input />
        </label>
        <PersonBar save={saved()} />
      </main>
    );
    act(() => screen.getByRole('textbox', { name: 'Altă valoare' }).focus());
    act(() => {
      viewport.height = 500;
      viewport.dispatchEvent(new Event('resize'));
    });
    const bar = screen.getByRole('region', { name: 'Verificarea persoanei' });
    expect(bar.dataset.keyboardOpen).toBe('true');
    expect(within(bar).queryByRole('group', { name: 'Fotografiile persoanei' })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Persoana următoare' })).toBeNull();
    expect(within(bar).getByRole('button', { name: '4 de hotărât' })).toBeTruthy();
    expect(within(bar).getByRole('status').textContent).toBe('Salvat în propunere');
  });
});
