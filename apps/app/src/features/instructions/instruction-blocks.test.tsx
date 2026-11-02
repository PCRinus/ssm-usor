import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InstructionBlocks } from './instruction-blocks';
import { articleBlock, headingBlock } from './instruction-draft';

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
