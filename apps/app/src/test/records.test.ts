import {
  clientDocumentDetailsSchema,
  clientFireSafetySchema,
  clientListItemSchema,
  importSourceResponseSchema,
} from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { employeeDetail, sheetSource } from './employee-import-fixture';
import {
  clientListItem,
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

describe('the sheet source builder', () => {
  it("answers each photographed sheet of the employee import with that file's id", () => {
    for (const file of employeeDetail().files as { id: string; uploadPath: string }[]) {
      const source = sheetSource(file.uploadPath);
      expect(importSourceResponseSchema.parse(source)).toEqual(source);
      expect(source.fileId).toBe(file.id);
    }
  });
});

describe('the clients list row builder', () => {
  it('is the client record with the columns of the list, as the API sends it', () => {
    expect(clientListItemSchema.parse(clientListItem())).toEqual(clientListItem());
  });
});
