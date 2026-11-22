import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NavigationButton } from './navigation-button';
import { useDocumentNavigation } from './use-document-navigation';

// The hook reaches the editor's document and pane through their class names and ids.
function Page() {
  const pane = useDocumentNavigation();
  return (
    <>
      <input aria-label="Titlu" />
      <div className="docx-pages" tabIndex={0} aria-label="Conținutul documentului" />
      <NavigationButton open={pane.open} onToggle={pane.toggle} />
      <div
        className="docx-nav"
        data-testid="pane"
        data-open={pane.navigation.open}
        data-tab={pane.navigation.tab}
        data-toggle={String(pane.navigation.toggle)}
      >
        <button type="button" onClick={() => pane.navigation.onOpenChange?.(false)}>
          Închide
        </button>
        <div id="docx-nav-panel-headings">
          <button type="button" className="docx-nav__heading">
            Capitolul VIII. Semnalizarea
          </button>
        </div>
        <div id="docx-nav-panel-find">
          <input type="search" className="docx-nav__search-input" aria-label="Caută în document" />
        </div>
      </div>
      <div role="dialog" aria-label="Dialog">
        <input aria-label="Câmp din dialog" />
      </div>
    </>
  );
}

const pane = () => screen.getByTestId('pane');
const draft = () => screen.getByLabelText('Conținutul documentului');
const searchBox = () => screen.getByLabelText('Caută în document');
const press = (target: Element, init: KeyboardEventInit) => fireEvent.keyDown(target, init);
const cmdF = { key: 'f', metaKey: true };

function onPlatform(platform: string) {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
}

beforeEach(() => {
  onPlatform('MacIntel');
  return () => vi.restoreAllMocks();
});

describe('the chapter and search pane', () => {
  it('starts closed and opens and closes from its button, without the editor’s own toggle', async () => {
    render(<Page />);
    expect(pane().dataset.open).toBe('false');
    expect(pane().dataset.toggle).toBe('false');
    const button = screen.getByRole('button', { name: /Navigare/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(button);
    expect(pane().dataset.open).toBe('true');
    expect(pane().dataset.tab).toBe('headings');
    expect(button.getAttribute('aria-expanded')).toBe('true');

    await userEvent.click(button);
    expect(pane().dataset.open).toBe('false');
  });

  it('opens on the search with the cursor in its box for Cmd+F in the document', () => {
    render(<Page />);
    draft().focus();

    expect(press(draft(), cmdF)).toBe(false);
    expect(pane().dataset.open).toBe('true');
    expect(pane().dataset.tab).toBe('find');
    expect(document.activeElement).toBe(searchBox());
  });

  it('leaves Cmd+F to the browser anywhere outside the document', () => {
    render(<Page />);
    const title = screen.getByLabelText('Titlu');
    title.focus();
    expect(press(title, cmdF)).toBe(true);

    const inDialog = screen.getByLabelText('Câmp din dialog');
    inDialog.focus();
    expect(press(inDialog, cmdF)).toBe(true);

    (document.activeElement as HTMLElement).blur();
    expect(press(document.body, cmdF)).toBe(true);
    expect(pane().dataset.open).toBe('false');
  });

  it('keeps Ctrl+F for moving the cursor on a Mac, and uses it elsewhere', () => {
    const { unmount } = render(<Page />);
    draft().focus();
    expect(press(draft(), { key: 'f', ctrlKey: true })).toBe(true);
    expect(pane().dataset.open).toBe('false');
    unmount();

    onPlatform('Win32');
    render(<Page />);
    draft().focus();
    expect(press(draft(), cmdF)).toBe(true);
    expect(press(draft(), { key: 'f', ctrlKey: true })).toBe(false);
    expect(pane().dataset.open).toBe('true');
  });

  it('keeps the focus in the search box and selects its text on another Cmd+F', async () => {
    render(<Page />);
    draft().focus();
    press(draft(), cmdF);
    await userEvent.type(searchBox(), 'preluare');

    expect(press(searchBox(), cmdF)).toBe(false);
    expect(document.activeElement).toBe(searchBox());
    const box = searchBox() as HTMLInputElement;
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 8]);
  });

  it('takes the focus back into the box when Enter moves to the next result', async () => {
    render(<Page />);
    draft().focus();
    press(draft(), cmdF);

    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    draft().focus();
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(document.activeElement).toBe(searchBox());
  });

  it('closes on Esc from the search box and gives the focus back to the document', () => {
    render(<Page />);
    draft().focus();
    press(draft(), cmdF);

    expect(press(searchBox(), { key: 'Escape' })).toBe(false);
    expect(pane().dataset.open).toBe('false');
    expect(document.activeElement).toBe(draft());
  });

  it('closes on Esc anywhere while open, leaving the focus where it is outside the pane', async () => {
    render(<Page />);
    await userEvent.click(screen.getByRole('button', { name: /Navigare/ }));
    draft().focus();

    expect(press(draft(), { key: 'Escape' })).toBe(false);
    expect(pane().dataset.open).toBe('false');
    expect(document.activeElement).toBe(draft());
  });

  it('leaves Esc to a dialog, and to an editor popup that handled it', () => {
    render(<Page />);
    draft().focus();
    press(draft(), cmdF);

    press(screen.getByLabelText('Câmp din dialog'), { key: 'Escape' });
    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    draft().dispatchEvent(handled);
    expect(pane().dataset.open).toBe('true');
  });

  it('gives the focus back to where the last Cmd+F came from', () => {
    render(<Page />);
    draft().focus();
    press(draft(), cmdF);
    draft().focus();
    press(draft(), cmdF);

    press(searchBox(), { key: 'Escape' });
    expect(document.activeElement).toBe(draft());
  });

  it('gives the focus back when the pane’s own arrow closes it', async () => {
    render(<Page />);
    draft().focus();
    press(draft(), cmdF);

    await userEvent.click(screen.getByRole('button', { name: 'Închide' }));
    expect(pane().dataset.open).toBe('false');
    expect(document.activeElement).toBe(draft());
  });

  it('gives Cmd+F back to the browser once the document page is left', () => {
    const { unmount } = render(<Page />);
    unmount();
    expect(fireEvent.keyDown(document.body, cmdF)).toBe(true);
  });
});
