import { documentTypeKeys } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { documentSections } from './document-sections';

describe('document sections', () => {
  it('hold every document of the pack once, in the pack order', () => {
    expect(documentSections.flatMap((section) => section.typeKeys)).toEqual([...documentTypeKeys]);
  });
});
