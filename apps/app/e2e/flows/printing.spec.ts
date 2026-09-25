import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  cleanUp,
  completeDocumentData,
  createAccount,
  createClientCompany,
  createOrganization,
  signIn,
} from './support';

// The headless shell has no PDF viewer, and without one the app downloads the PDF instead.
test.use({ channel: 'chromium' });
test.afterAll(cleanUp);

async function act(page: Page, row: Locator, action: string) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await row.getByTestId('document-actions').click();
  await page.getByTestId(action).click();
}

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
  const owner = await createAccount('documents-print', 'Dana Documente');
  const organizationId = await createOrganization('Tipărire E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT TIPĂRIRE E2E S.R.L.');
  await completeDocumentData(organizationId, owner.id, clientId);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/documents`);
  await page.getByTestId('documents-generate').click();
  await page.getByTestId('generate-submit').click();
  await expect(page.getByTestId('document-row')).toHaveCount(19);
  const firstAid = page
    .getByTestId('document-row')
    .filter({ hasText: 'Decizia privind responsabilii cu primul ajutor' });

  // A draft has no PDF of its own, so one is made from its file.
  let conversion = page.waitForResponse((response) => response.url().endsWith('/print'));
  await act(page, firstAid, 'document-print-draft');
  expect((await conversion).headers()['content-type']).toBe('application/pdf');
  await expect.poll(printed).toEqual(['application/pdf']);

  await act(page, firstAid, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1', {
    timeout: 60_000,
  });
  let conversions = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/print')) conversions += 1;
  });
  await act(page, firstAid, 'document-print-issued');
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
