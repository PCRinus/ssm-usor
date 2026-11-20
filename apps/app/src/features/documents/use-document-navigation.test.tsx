import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NavigationButton } from './navigation-button';
import { useDocumentNavigation } from './use-document-navigation';

// The pane's markup as the editor draws it: the hook finds its parts by these classes and ids.
function Page({ ready = true }: { ready?: boolean }) {
  const isReady = useRef(ready);
  const pane = useDocumentNavigation(isReady);
  return (
    <>
      <textarea aria-label="Ciorna" />
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
    </>
  );
}

const pane = () => screen.getByTestId('pane');
const findShortcut = (init: KeyboardEventInit = { metaKey: true }) =>
  fireEvent.keyDown(screen.getByLabelText('Ciorna'), { key: 'f', ...init });

describe('the chapter and search pane', () => {
  it('starts closed and opens and closes from its button, without the editor’s own toggle', async () => {
    render(<Page />);
    expect(pane().dataset.open).toBe('false');
    expect(pane().dataset.toggle).toBe('false');
    const button = screen.getByRole('button', { name: /Cuprins/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(button);
    expect(pane().dataset.open).toBe('true');
    expect(pane().dataset.tab).toBe('headings');
    expect(button.getAttribute('aria-expanded')).toBe('true');

    await userEvent.click(button);
    expect(pane().dataset.open).toBe('false');
  });

  it('opens on the search with the cursor in its box for Cmd+F and Ctrl+F, instead of the browser’s find', () => {
    render(<Page />);
    screen.getByLabelText('Ciorna').focus();

    expect(findShortcut()).toBe(false);
    expect(pane().dataset.open).toBe('true');
    expect(pane().dataset.tab).toBe('find');
    expect(document.activeElement).toBe(screen.getByLabelText('Caută în document'));

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(findShortcut({ ctrlKey: true })).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText('Caută în document'));
  });

  it('leaves Cmd+F to the browser until the document is laid out, and with other modifiers', () => {
    const { unmount } = render(<Page ready={false} />);
    expect(findShortcut()).toBe(true);
    expect(pane().dataset.open).toBe('false');
    unmount();

    render(<Page />);
    expect(findShortcut({ metaKey: true, shiftKey: true })).toBe(true);
    expect(pane().dataset.open).toBe('false');
  });

  it('gives Cmd+F back to the browser once the document page is left', () => {
    const { unmount } = render(<Page />);
    unmount();
    expect(fireEvent.keyDown(document.body, { key: 'f', metaKey: true })).toBe(true);
  });

  it('closes on Esc from inside the pane and gives the focus back to the draft', () => {
    render(<Page />);
    const draft = screen.getByLabelText('Ciorna');
    draft.focus();
    findShortcut();

    expect(fireEvent.keyDown(screen.getByLabelText('Caută în document'), { key: 'Escape' })).toBe(
      false
    );
    expect(pane().dataset.open).toBe('false');
    expect(document.activeElement).toBe(draft);
  });

  it('leaves Esc alone outside the pane', () => {
    render(<Page />);
    findShortcut();
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true);
    expect(pane().dataset.open).toBe('true');
  });

  it('gives the focus back when the pane’s own arrow closes it', async () => {
    render(<Page />);
    const draft = screen.getByLabelText('Ciorna');
    draft.focus();
    findShortcut();

    await userEvent.click(screen.getByRole('button', { name: 'Închide' }));
    expect(pane().dataset.open).toBe('false');
    expect(document.activeElement).toBe(draft);
  });

  it('closes after a chapter is picked on a phone, so the page shows', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: true, media: query }))
    );
    render(<Page />);
    await userEvent.click(screen.getByRole('button', { name: /Cuprins/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Capitolul VIII. Semnalizarea' }));
    expect(pane().dataset.open).toBe('false');
  });

  it('stays open after a chapter is picked on a wide screen', async () => {
    render(<Page />);
    await userEvent.click(screen.getByRole('button', { name: /Cuprins/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Capitolul VIII. Semnalizarea' }));
    expect(pane().dataset.open).toBe('true');
  });
});
