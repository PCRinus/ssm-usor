import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WordDiff } from './word-diff-view';

const marked = (diff: HTMLElement) =>
  [...diff.querySelectorAll('del, ins')].map((node) => `${node.tagName}:${node.textContent}`);

describe('the passage diff', () => {
  it('lays out a changed paragraph break as the new text has it, with no empty mark', () => {
    render(
      <WordDiff before={'alin. (1)\nText vechi.'} after={'alin. (1)\n\nText nou.'} testId="d" />
    );

    const diff = screen.getByTestId('d');
    expect(marked(diff)).toEqual(['DEL:Removed: vechi', 'INS:Added: nou']);
    expect(diff.textContent).toBe('alin. (1)\n\nText Removed: vechiAdded: nou.');
  });

  it('strikes nothing for a removed double space', () => {
    render(<WordDiff before="a)  dublu spațiu" after="a) dublu spațiu" testId="d" />);

    const diff = screen.getByTestId('d');
    expect(marked(diff)).toEqual([]);
    expect(diff.textContent).toBe('a) dublu spațiu');
  });

  it('sets a replacement apart from the word it replaces', () => {
    render(<WordDiff before="termen de 30 de zile" after="termen de 60 de zile" testId="d" />);

    const inserted = screen.getByTestId('d').querySelector('ins')!;
    expect(inserted.textContent).toBe('Added: 60');
    expect(inserted.className).toContain('ml-1');
  });
});
