import { expect, test } from '@playwright/test';
import { toProposal } from '@ssm-usor/import';

import { cleanUp, createAccount, createLibraryImport, createOrganization, signIn } from './support';

test.afterAll(cleanUp);

test('smoking choices remain readable and selectable at 320px with a long source filename', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const owner = await createAccount('import-mobile-choices', 'Ioana Import');
  const organizationId = await createOrganization('Import mobil E2E', owner.id);
  const legalName = 'Brutăria Spicul Auriu SRL';
  const cui = '1590082';
  const file = 'Dosar/DECIZIEPRIVINDREGLEMENTAREAFUMATULUIBRUTARIASPICULAURIUSIBIU2026.docx';
  const proposal = toProposal({
    facts: [
      { field: 'client.legalName', value: legalName, file, quote: legalName, otherCompany: null },
      { field: 'client.cui', value: cui, file, quote: cui, otherCompany: null },
    ],
    workplaces: [],
    workplaceFacts: [],
    jobPositionFacts: [],
    jobPositions: [],
    responsiblePersons: [],
    fireEquipment: [],
    fireInstallations: [],
    protectiveEquipment: [],
    employees: [],
    notes: [],
  });
  proposal.fireSafety.smokingPolicy = {
    options: [
      {
        value: 'forbidden_everywhere',
        sources: [{ file, quote: 'Fumatul este interzis în toate spațiile unității.' }],
        otherCompanyName: null,
      },
      {
        value: 'designated_places',
        sources: [{ file, quote: 'Fumatul este permis numai în locurile amenajate și marcate.' }],
        otherCompanyName: null,
      },
    ],
  };
  const importId = await createLibraryImport({
    organizationId,
    createdBy: owner.id,
    legalName,
    cui,
    posts: [],
    clientProposal: proposal,
  });
  await signIn(page, owner.email, `/clienti/import/${importId}/fire-safety`);

  const choice = page.getByTestId('review-choice');
  await expect(choice).toContainText('Fumatul');
  await page
    .getByTestId('import-action-bar')
    .getByRole('button', { name: '1 alegere', exact: true })
    .click();
  await expect(choice).toBeFocused();
  const focused = await choice.boundingBox();
  const header = await page.getByRole('banner').boundingBox();
  expect(focused!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(
    await choice
      .getByRole('radio')
      .evaluateAll((radios) => radios.some((radio) => radio.matches(':checked')))
  ).toBe(false);
  const options = choice.getByRole('radio').filter({ visible: true });
  await expect(options).toHaveCount(3);
  for (const radio of (await options.all()).slice(0, 2)) {
    const card = radio.locator('..');
    const geometry = await card.evaluate((element) => {
      const label = element.querySelector('label')!;
      const card = element.getBoundingClientRect();
      const bounds = label.getBoundingClientRect();
      const container = element.parentElement!.getBoundingClientRect();
      return {
        cardWidth: card.width,
        labelWidth: bounds.width,
        cardOverflow: element.scrollWidth - element.clientWidth,
        labelOverflow: label.scrollWidth - label.clientWidth,
        cardInside: card.left >= container.left - 1 && card.right <= container.right + 1,
        labelInside: bounds.left >= card.left && bounds.right <= card.right + 1,
      };
    });
    expect(geometry.cardInside).toBe(true);
    expect(geometry.labelInside).toBe(true);
    expect(geometry.cardOverflow).toBeLessThanOrEqual(1);
    expect(geometry.labelOverflow).toBeLessThanOrEqual(1);
    expect(geometry.labelWidth).toBeGreaterThan(geometry.cardWidth / 2);
  }

  const forbidden = choice.getByRole('radio', { name: /Fumatul este interzis/ });
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/imports/${importId}/changes`) &&
      response.request().method() === 'PUT' &&
      response.ok()
  );
  await forbidden.check();
  await saved;
  await expect(forbidden).toBeChecked();
  await page.reload();
  await expect(
    page.getByTestId('review-choice').getByRole('radio', { name: /Fumatul este interzis/ })
  ).toBeChecked();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const footer = page.locator('main + footer');
  await expect(footer).toBeInViewport();
  await expect
    .poll(async () => {
      const barBounds = await page.getByTestId('import-action-bar').boundingBox();
      const footerBounds = await footer.boundingBox();
      return barBounds!.y + barBounds!.height - footerBounds!.y;
    })
    .toBeLessThanOrEqual(1);
});
