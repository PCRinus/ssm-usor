import { describe, expect, it } from 'vitest';

import { documentFileName } from './downloads';

describe('documentFileName', () => {
  it('names a document by its binder number, its title and, when dated, its year', () => {
    expect(
      documentFileName({
        type_key: 'cover_decisions',
        title: 'Copertă – Deciziile interne',
        period: null,
      })
    ).toBe('1.0 Copertă - Deciziile interne');
    expect(
      documentFileName({ type_key: 'fire_annual_report', title: 'Raportul anual', period: 2026 })
    ).toBe('7.2 Raportul anual 2026');
  });

  it('names a document outside the binder by its title alone', () => {
    expect(
      documentFileName({
        type_key: 'service_contract',
        title: 'Contract de prestări servicii',
        period: null,
      })
    ).toBe('Contract de prestări servicii');
  });
});
