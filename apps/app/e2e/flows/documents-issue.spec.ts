import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  accessTokenOf,
  cleanUp,
  completeDocumentData,
  createAccount,
  createClientCompany,
  createOrganization,
  openDocumentSection,
  openedPdf,
  rowTitled,
  signIn,
} from './support';

// Issuing and printing documents of one set, generated once: a set takes 8 to 10 s on CI. Each
// test issues a document no other test touches, and keeps a budget of its own, since the one
// test they once were ran out of its minute (56f45c782).
test.describe.configure({ mode: 'serial' });
// The headless shell has no PDF viewer, and without one the app downloads the PDF instead.
test.use({ channel: 'chromium' });
test.afterAll(cleanUp);

let email: string;
let clientId: string;

test.beforeAll(async () => {
  const owner = await createAccount('documents-issue', 'Dana Documente');
  email = owner.email;
  const organizationId = await createOrganization('Documente EMITERE DOCUMENTE E2E', owner.id);
  clientId = await createClientCompany(organizationId, 'S.C. EMITERE DOCUMENTE E2E S.R.L.');
  await completeDocumentData(organizationId, owner.id, clientId);
  const generated = await fetch(
    new URL(`/clients/${clientId}/documents/generate`, process.env.E2E_API_URL),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessTokenOf(email)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ issueDate: '2026-01-19', firstDecisionNumber: 3 }),
    }
  );
  expect(generated.status).toBe(201);
  const { created, skipped } = (await generated.json()) as {
    created: unknown[];
    skipped: string[];
  };
  expect(created.length).toBeGreaterThan(0);
  expect(skipped).toEqual([]);
});

async function act(page: Page, row: Locator, action: string) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await row.getByTestId('document-actions').click();
  await page.getByTestId(action).click();
}

async function openDocuments(page: Page, section: string) {
  await signIn(page, email, `/clienti/${clientId}/documente-ssm`);
  await openDocumentSection(page, section);
  return page.getByTestId('document-row');
}

test('a decision is issued with its PDF, and a new draft of it can be made and dropped', async ({
  page,
}) => {
  const rows = await openDocuments(page, '1');
  const firstAid = rows.filter({ hasText: 'Decizia privind responsabilii cu primul ajutor' });

  await act(page, firstAid, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1', {
    timeout: 60_000,
  });
  await expect(firstAid.getByTestId('document-draft')).toHaveCount(0);

  // Where a converter runs, issuing also made the PDF, locked beside the Word file.
  if (process.env.GOTENBERG_URL) {
    const pdf = await openedPdf(page, firstAid);
    expect(pdf.disposition).toMatch(
      /^inline; filename="1\.3 Decizia privind responsabilii cu primul ajutor - rev\. 1\.pdf"; filename\*=UTF-8''/
    );
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
  }

  await act(page, firstAid, 'document-regenerate');
  await page.getByTestId('document-confirm').click();
  await expect(firstAid.getByTestId('document-draft')).toHaveText('Ciornă · rev. 2');
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1');

  await act(page, firstAid, 'document-delete-draft');
  await page.getByTestId('document-confirm').click();
  await expect(firstAid.getByTestId('document-draft')).toHaveCount(0);
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1');
});

test('the training material is issued', async ({ page }) => {
  // The training material's chapter of the unit's own risks prints the unacceptable factors
  // of the evaluations (ADR 015), so nothing is left to fill in by hand.
  const rows = await openDocuments(page, '2');
  const material = rowTitled(rows, /^Material de instruire introductiv-generală/);
  await act(page, material, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(material.getByTestId('document-issued')).toHaveText('Emis · rev. 1', {
    timeout: 30_000,
  });
});

test('the risk assessment is issued', async ({ page }) => {
  const rows = await openDocuments(page, '9');
  const assessment = rows.filter({ hasText: 'Evaluarea riscurilor' });
  await expect(assessment.getByTestId('document-draft')).toHaveText('Ciornă · rev. 1');
  await act(page, assessment, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(assessment.getByTestId('document-issued')).toHaveText('Emis · rev. 1', {
    timeout: 60_000,
  });
});

test('a document is printed as a PDF, from the list and from the editor', async ({ page }) => {
  test.skip(!process.env.GOTENBERG_URL, 'Printing needs the PDF converter (docs/pdf.md).');
  // The print dialog cannot be driven; what reaches it is recorded instead.
  await page.addInitScript(() => {
    const record = window as Window & { printed?: string[] };
    const contentWindow = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      'contentWindow'
    )!.get!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      get(this: HTMLIFrameElement) {
        const frame = contentWindow.call(this) as Window | null;
        if (this.dataset.testid !== 'print-frame' || !frame) return frame;
        return new Proxy(frame, {
          get: (target, key) =>
            key === 'print'
              ? () => {
                  record.printed = [...(record.printed ?? []), target.document.contentType];
                }
              : Reflect.get(target, key),
        });
      },
    });
  });
  const printed = () =>
    page.evaluate(() => (window as Window & { printed?: string[] }).printed ?? []);
  const rows = await openDocuments(page, '1');
  const danger = rows.filter({ hasText: 'Decizia privind pericolul grav și iminent' });

  // A draft has no PDF of its own, so one is made from its file.
  let conversion = page.waitForResponse((response) => response.url().endsWith('/print'));
  await act(page, danger, 'document-print-draft');
  expect((await conversion).headers()['content-type']).toBe('application/pdf');
  await expect.poll(printed).toEqual(['application/pdf']);

  await act(page, danger, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(danger.getByTestId('document-issued')).toHaveText('Emis · rev. 1', {
    timeout: 60_000,
  });
  let conversions = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/print')) conversions += 1;
  });
  await act(page, danger, 'document-print-issued');
  await expect.poll(printed).toHaveLength(2);
  expect(conversions).toBe(0);

  await page.getByRole('link', { name: 'Decizia privind echipa de evaluare a riscurilor' }).click();
  const frame = page.getByTestId('editor-frame');
  await expect(frame).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await frame.getByText('DECIDE:').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' DE TIPĂRIT');
  conversion = page.waitForResponse((response) => response.url().endsWith('/print'));
  await page.getByTestId('editor-print').click();
  expect((await conversion).status()).toBe(200);
  await expect.poll(printed).toHaveLength(3);
  await expect(page.getByTestId('editor-saved-state')).toHaveText('Modificări nesalvate');
});
