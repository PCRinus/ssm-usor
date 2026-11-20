import { describe, expect, it } from 'vitest';

import { printedNames } from './printed-names';

const data = {
  client: { legalName: 'S.C. PIPETECH S.R.L.', representativeName: 'Ion POP' },
  provider: { legalName: 'SERVICIU EXTERN SRL' },
  themes: { positions: [{ name: 'Sudor', trainer: 'SERVICIU EXTERN SRL – Ana IONESCU' }] },
  issueDate: '19.01.2026',
};

describe('printedNames', () => {
  it('keeps the legal form with the name wherever the occupational safety set prints it', () => {
    expect(printedNames('occupational_safety')(data)).toEqual({
      client: { legalName: 'S.C. PIPETECH S.R.L.', representativeName: 'Ion POP' },
      provider: { legalName: 'SERVICIU EXTERN SRL' },
      themes: {
        positions: [{ name: 'Sudor', trainer: 'SERVICIU EXTERN SRL – Ana IONESCU' }],
      },
      issueDate: '19.01.2026',
    });
  });

  it('leaves the fire-safety set and data without the parties as they are', () => {
    expect(printedNames('fire_safety')(data)).toBe(data);
    const alone = { issueDate: '19.01.2026' };
    expect(printedNames('occupational_safety')(alone)).toBe(alone);
  });
});
