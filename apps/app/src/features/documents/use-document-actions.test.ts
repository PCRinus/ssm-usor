import { describe, expect, it } from 'vitest';

import { ApiHttpError } from '@/api/http';
import { sessionExpiredMessage } from '@/lib/api-errors';

import type { ClientDocument } from './document-labels';
import { documentActionFailure } from './use-document-actions';

const document = { title: 'Referat de control', typeKey: 'control_report' } as ClientDocument;

const refusal = (status: number, reason?: string, missing?: string[]) =>
  new ApiHttpError(status, { error: 'conflict', reason, missing });

describe('what a failed regenerate, issue or delete says', () => {
  it('words a refusal every page shares the same way', () => {
    expect(documentActionFailure(new ApiHttpError(401, undefined), document)).toBe(
      sessionExpiredMessage
    );
  });

  it('says the document was not issued when its PDF could not be made', () => {
    expect(documentActionFailure(refusal(503, 'pdf_unavailable'), document)).toBe(
      'Nu am putut face PDF-ul pentru „8 Referat de control”, așa că documentul nu a fost emis. Încearcă din nou peste câteva momente.'
    );
  });

  it('hands back the missing data to list under the notice', () => {
    expect(
      documentActionFailure(
        refusal(409, 'missing_document_data', ['client.representativeName']),
        document
      )
    ).toEqual({ document, missing: ['client.representativeName'] });
  });

  it('points to the client pages when the API does not say what is missing', () => {
    expect(documentActionFailure(refusal(409, 'missing_document_data', []), document)).toBe(
      'Lipsesc date de care documentul are nevoie. Completează-le în paginile clientului, apoi generează documentul din nou.'
    );
  });

  it('says the list is out of date after a 404 or another 409', () => {
    const outOfDate = 'Documentul s-a schimbat între timp. Lista a fost reîncărcată.';
    expect(documentActionFailure(new ApiHttpError(404, undefined), document)).toBe(outOfDate);
    expect(documentActionFailure(refusal(409), document)).toBe(outOfDate);
  });

  it('asks to check the connection otherwise', () => {
    expect(documentActionFailure(new TypeError('Failed to fetch'), document)).toBe(
      'Operațiunea nu a reușit. Verifică conexiunea și încearcă din nou.'
    );
  });
});
