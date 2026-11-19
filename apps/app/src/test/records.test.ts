import { clientDocumentDetailsSchema, clientFireSafetySchema } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import {
  documentDetailsRecord,
  employeeListItem,
  employeeRecord,
  fireSafetyRecord,
  noPortalAccess,
} from './records';

describe('the employee list row builder', () => {
  it('is the same person as the employee record, with only the fields a list row has', () => {
    const row = employeeListItem({ lastName: 'Popescu', signaturesPending: 2 });

    expect(row).toMatchObject({
      id: employeeRecord().id,
      lastName: 'Popescu',
      signaturesPending: 2,
      portal: noPortalAccess,
    });
    expect(row).not.toHaveProperty('cnp');
    expect(row).not.toHaveProperty('archivedAt');
  });
});

describe('the builders of a client with nothing filled in yet', () => {
  it('build the data as the API sends it', () => {
    expect(clientFireSafetySchema.parse(fireSafetyRecord())).toEqual(fireSafetyRecord());
    expect(clientDocumentDetailsSchema.parse(documentDetailsRecord())).toEqual(
      documentDetailsRecord()
    );
  });
});
