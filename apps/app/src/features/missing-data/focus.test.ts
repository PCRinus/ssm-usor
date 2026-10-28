import { setupAuthorizationsFields, setupCompanyFields } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { authorizationsFocus, organizationCompanyFocus } from './focus';

const inPageOrder = (page: readonly string[], fields: readonly string[]) =>
  page.filter((key) => fields.includes(key));

describe("the setup guide's missing fields", () => {
  it('are focus keys of Date firmă, in its order', () => {
    expect(inPageOrder(organizationCompanyFocus, setupCompanyFields)).toEqual([
      ...setupCompanyFields,
    ]);
  });

  it('are focus keys of Abilitări, in its order', () => {
    expect(inPageOrder(authorizationsFocus, setupAuthorizationsFields)).toEqual([
      ...setupAuthorizationsFields,
    ]);
  });
});
