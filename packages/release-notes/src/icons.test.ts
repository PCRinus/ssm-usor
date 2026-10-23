import { describe, expect, it } from 'vitest';

import { isLucideIcon } from './icons';

describe('isLucideIcon', () => {
  it('accepts lucide names in kebab case', () => {
    expect(isLucideIcon('clipboard-check')).toBe(true);
    expect(isLucideIcon('smartphone')).toBe(true);
    expect(isLucideIcon('file-text')).toBe(true);
  });

  it('accepts an alias lucide still renders', () => {
    expect(isLucideIcon('alarm-check')).toBe(true);
  });

  it('rejects a misspelt name, a PascalCase name and an empty one', () => {
    expect(isLucideIcon('clipboard-checkk')).toBe(false);
    expect(isLucideIcon('ClipboardCheck')).toBe(false);
    expect(isLucideIcon('Clipboard-Check')).toBe(false);
    expect(isLucideIcon('')).toBe(false);
  });

  it('rejects names inherited from Object', () => {
    expect(isLucideIcon('constructor')).toBe(false);
    expect(isLucideIcon('toString')).toBe(false);
  });
});
