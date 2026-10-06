import { documentTypeKeys, fireSafetyDocumentTypeKeys } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { documentSections, fireSafetyDocumentSections, sectionOf } from './document-sections';

describe('document sections', () => {
  it('hold every document of the pack once, in the pack order', () => {
    expect(documentSections.flatMap((section) => section.typeKeys)).toEqual([...documentTypeKeys]);
  });

  it('hold every fire-safety document once, in the binder order', () => {
    expect(fireSafetyDocumentSections.flatMap((section) => section.typeKeys)).toEqual([
      ...fireSafetyDocumentTypeKeys,
    ]);
  });

  it('place a type in the sections of its own set', () => {
    expect(sectionOf('fire_work_permit', 'fire_safety')).toBe('registers');
    expect(sectionOf('fire_smoking_decision', 'fire_safety')).toBe('other');
    expect(sectionOf('control_report')).toBe('control-report');
  });
});
