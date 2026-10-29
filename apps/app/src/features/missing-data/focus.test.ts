import { setupAuthorizationsFields, setupCompanyFields } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { authorizationsFocus, organizationCompanyFocus } from './focus';

describe("the setup guide's missing fields", () => {
  it('follow the Date firmă form, the CUI first, and are focus keys of the page', () => {
    expect(setupCompanyFields).toEqual([
      'cui',
      'legal-name',
      'address',
      'representative-name',
      'representative-role',
    ]);
    expect(organizationCompanyFocus).toEqual(expect.arrayContaining([...setupCompanyFields]));
  });

  it('follow the Abilitări form and are focus keys of the page', () => {
    expect(setupAuthorizationsFields).toEqual(['certificate', 'fire-safety-technician']);
    expect(authorizationsFocus).toEqual(expect.arrayContaining([...setupAuthorizationsFields]));
  });
});
