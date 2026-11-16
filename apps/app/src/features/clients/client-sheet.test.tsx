import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClientSheet } from './client-sheet';

describe('ClientSheet', () => {
  it('pads its content, and a flush sheet leaves the edges to it', () => {
    render(
      <>
        <ClientSheet data-testid="padded" />
        <ClientSheet data-testid="flush" flush />
      </>
    );
    const padded = screen.getByTestId('padded');
    const flush = screen.getByTestId('flush');
    expect(padded.classList).toContain('p-4');
    expect(padded.hasAttribute('data-flush')).toBe(false);
    expect(flush.classList).not.toContain('p-4');
    expect(flush.classList).not.toContain('sm:p-6');
    expect(flush.hasAttribute('data-flush')).toBe(true);
  });
});
