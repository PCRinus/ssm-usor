import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionCard } from './section-card';

const topic = 'primii-pasi.deschide-ajutorul';

describe('SectionCard', () => {
  it('shows its title with the help link beside it', () => {
    render(<SectionCard title="Alte documente" help={topic} description="Fișierele clientului." />);
    expect(screen.getByRole('heading', { name: 'Alte documente' }).className).not.toContain(
      'sr-only'
    );
    expect(screen.getByRole('link', { name: 'Ajutor: Alte documente' })).toBeTruthy();
  });

  it('keeps a hidden title as the heading, without a help link left on its own', () => {
    render(
      <SectionCard
        title="Alte documente"
        help={topic}
        hideTitle
        description="Fișierele clientului."
      />
    );
    expect(screen.getByRole('heading', { name: 'Alte documente' }).className).toContain('sr-only');
    expect(screen.queryByRole('link', { name: /Ajutor/ })).toBeNull();
    expect(screen.getByText('Fișierele clientului.')).toBeTruthy();
  });
});
