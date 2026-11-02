import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { InstructionBlocks } from './instruction-blocks';
import { articleBlock, type DraftBlock, headingBlock } from './instruction-draft';

describe('InstructionBlocks', () => {
  it('shows a chapter title written over a section as a printed section, not an empty one', () => {
    const blocks = [
      headingBlock('CAPITOLUL I'),
      headingBlock('Domeniul de aplicare'),
      articleBlock('Instrucțiunea se aplică lucrului la birou.'),
      headingBlock('Note'),
    ];
    render(
      <InstructionBlocks
        blocks={blocks}
        category="work_activity"
        namedClients={new Map()}
        onChange={() => {}}
      />
    );
    const [chapter, scope, notes] = screen.getAllByTestId('instruction-section');
    expect(chapter!.dataset.empty).toBeUndefined();
    expect(chapter!.querySelector('[data-testid="instruction-section-unprinted"]')).toBeNull();
    expect(scope!.dataset.empty).toBeUndefined();
    expect(notes!.dataset.empty).toBe('true');
    expect(notes!.querySelector('[data-testid="instruction-section-unprinted"]')).not.toBeNull();
  });
});

describe('adding a section on a phone', () => {
  it('opens the sections of the guide in a drawer and adds the one picked at its place', async () => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('max-width'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
    const user = userEvent.setup();
    function Form() {
      const [blocks, setBlocks] = useState<DraftBlock[]>(() => [
        headingBlock('Domeniul de aplicare'),
        articleBlock('Instrucțiunea se aplică lucrului la birou.'),
        headingBlock('În timpul lucrului'),
        articleBlock('Lucrătorul păstrează căile libere.'),
      ]);
      return (
        <InstructionBlocks
          blocks={blocks}
          category="work_activity"
          namedClients={new Map()}
          onChange={setBlocks}
        />
      );
    }
    render(<Form />);
    await user.click(screen.getByTestId('instruction-add-section'));
    const drawer = await screen.findByTestId('instruction-section-picker');
    expect(within(drawer).getByRole('heading').textContent).toBe('Adaugă o secțiune');
    await user.click(within(drawer).getByText('Calificarea necesară'));
    const titles = screen
      .getAllByTestId('instruction-heading-text')
      .map((input) => (input as HTMLInputElement).value);
    expect(titles).toEqual(['Domeniul de aplicare', 'Calificarea necesară', 'În timpul lucrului']);
  });
});
