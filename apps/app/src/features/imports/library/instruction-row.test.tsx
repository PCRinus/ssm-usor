import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { InstructionRow } from './instruction-row';
import {
  type InstructionChange,
  type LibraryPost,
  type ProposedInstruction,
  rowState,
} from './library-model';

const proposed = (overrides: Partial<ProposedInstruction> = {}): ProposedInstruction => ({
  key: 'car',
  file: 'Dosar/IPSSM.docx',
  number: 'XIII.1',
  writtenTitle: 'Instrucțiuni proprii privind utilizarea autoturismelor în interes de serviciu',
  title: 'Utilizarea autoturismelor în interes de serviciu',
  category: 'work_equipment',
  body: { blocks: [{ kind: 'article', paragraphs: ['Conducătorul verifică frânele.'] }] },
  articleCount: 1,
  sourceNumbers: [4],
  location: { file: 'Dosar/IPSSM.docx', start: 0, end: 10, firstParagraph: 2, lastParagraph: 3 },
  status: 'new',
  match: null,
  choice: null,
  posts: [],
  flags: [],
  sameAs: [],
  ...overrides,
});

const postsById = new Map([
  ['position-1', { id: 'position-1', name: 'Tâmplar' } as unknown as LibraryPost],
]);

function Harness({
  instruction,
  positionPosts = {},
  onChanged = () => {},
}: {
  instruction: ProposedInstruction;
  positionPosts?: Record<string, string | null>;
  onChanged?: (change: InstructionChange) => void;
}) {
  const [change, setChange] = useState<InstructionChange>({});
  return (
    <InstructionRow
      row={rowState(instruction, change, positionPosts)}
      domain="ssm"
      postsById={postsById}
      readOnly={false}
      titleTaken={false}
      onChange={(update) =>
        setChange((current) => {
          const next = update(current);
          onChanged(next);
          return next;
        })
      }
      onSource={() => {}}
      onEditBody={() => {}}
      onPickPosts={() => {}}
    />
  );
}

describe('InstructionRow', () => {
  it('asks for the posts of a new instruction that has none', () => {
    render(<Harness instruction={proposed()} />);
    expect(screen.getByTestId('library-instruction-pending').textContent).toContain(
      'Mai ai de ales posturile'
    );
    expect(screen.getByTestId('library-instruction-pick-posts').textContent).toContain(
      'Alege posturile'
    );
  });

  it('renames in place and keeps the new title once saved', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <Harness
        instruction={proposed({ posts: ['theme-1'] })}
        positionPosts={{ 'theme-1': 'position-1' }}
        onChanged={onChanged}
      />
    );
    expect(screen.getByTestId('library-instruction-pending').textContent).toContain(
      'Gata de confirmat'
    );
    expect(screen.queryByTestId('library-instruction-title-input')).toBeNull();
    await user.click(screen.getByTestId('library-instruction-rename'));
    const input = screen.getByTestId('library-instruction-title-input');
    await user.clear(input);
    await user.type(input, 'Autoturismul de serviciu{Enter}');
    expect(onChanged).toHaveBeenLastCalledWith({ title: 'Autoturismul de serviciu' });
    expect(screen.getByTestId('library-instruction-library-title').textContent).toContain(
      'Autoturismul de serviciu'
    );
  });

  it('keeps asking about a similar instruction until a choice is picked, even the proposed one', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <Harness
        instruction={proposed({
          status: 'similar',
          choice: 'use_existing',
          posts: ['theme-1'],
          match: {
            moduleId: 'm-1',
            title: 'Utilizarea autovehiculelor',
            similarity: 0.7,
            decidedBy: 'overlap',
            differences: [],
          },
        })}
        positionPosts={{ 'theme-1': 'position-1' }}
        onChanged={onChanged}
      />
    );
    expect(screen.getByTestId('library-instruction-pending').textContent).toContain(
      'Mai ai de ales ce primesc posturile'
    );
    expect(
      within(screen.getByTestId('library-instruction-similar')).getByText(
        'Utilizarea autovehiculelor'
      )
    ).toBeTruthy();
    expect((screen.getByTestId('library-choice-use_existing') as HTMLInputElement).checked).toBe(
      true
    );
    expect(screen.queryByTestId('library-instruction-rename')).toBeNull();

    await user.click(screen.getByTestId('library-choice-use_existing'));
    expect(onChanged).toHaveBeenLastCalledWith({ choice: 'use_existing' });
    expect(screen.getByTestId('library-instruction-pending').textContent).toContain(
      'Gata de confirmat'
    );

    await user.click(screen.getByTestId('library-choice-add_new'));
    expect(screen.getByTestId('library-instruction-rename')).toBeTruthy();
  });

  it('names a similar pack instruction by its own title while keeping the library match separate', () => {
    render(
      <Harness
        instruction={proposed({
          status: 'similar',
          choice: 'use_existing',
          match: {
            moduleId: 'm-1',
            title: 'Utilizarea autovehiculelor',
            similarity: 0.75,
            decidedBy: 'overlap',
            differences: [],
          },
        })}
      />
    );
    expect(screen.getByTestId('library-instruction-title').textContent).toBe(
      'Utilizarea autoturismelor în interes de serviciu'
    );
    expect(screen.getByTestId('library-instruction-similar').textContent).toContain(
      'Utilizarea autovehiculelor din biblioteca ta'
    );
    expect((screen.getByTestId('library-choice-use_existing') as HTMLInputElement).checked).toBe(
      true
    );
  });

  it('folds a left-out instruction to its title and switch', async () => {
    const user = userEvent.setup();
    render(<Harness instruction={proposed()} />);
    await user.click(screen.getByTestId('library-instruction-included'));
    expect(screen.getByTestId('library-instruction-included-word').textContent).toBe(
      'Nu e inclusă'
    );
    expect(screen.queryByTestId('library-instruction-pick-posts')).toBeNull();
    expect(screen.queryByTestId('library-instruction-pending')).toBeNull();
    expect(screen.queryByTestId('review-source')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('names the switch by its state and shows a word only when left out', async () => {
    const user = userEvent.setup();
    render(<Harness instruction={proposed()} />);
    const title = 'Utilizarea autoturismelor în interes de serviciu';
    expect(screen.getByRole('switch', { name: `Inclusă: ${title}` })).toBeTruthy();
    expect(screen.queryByTestId('library-instruction-included-word')).toBeNull();

    await user.click(screen.getByTestId('library-instruction-included'));

    expect(screen.getByRole('switch', { name: `Nu e inclusă: ${title}` })).toBeTruthy();

    await user.click(screen.getByTestId('library-instruction-included'));

    expect(screen.getByRole('switch', { name: `Inclusă: ${title}` })).toBeTruthy();
    expect(screen.getByTestId('library-instruction-pick-posts')).toBeTruthy();
  });
});
