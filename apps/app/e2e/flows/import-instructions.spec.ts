import { expect, test } from '@playwright/test';

import { bakery, bakeryProposal, officeWork } from './instructions-pack';
import {
  cleanUp,
  clientOfImport,
  createAccount,
  createInstructionModule,
  createLibraryImport,
  createOrganization,
  jobPositionId,
  signIn,
} from './support';

test.afterAll(cleanUp);

// The library part of a client import (ADR 034, "Where it sits in the import"), seeded as the
// reading leaves it, since the local stack has no model to read a pack with.

test("a pack's own instructions are reviewed before the client is created, confirmed after it, and land in the library and on the posts", async ({
  page,
}) => {
  const owner = await createAccount('import-instructions', 'Ioana Import');
  const organizationId = await createOrganization('Instrucțiuni din import E2E', owner.id);
  const ladders = await createInstructionModule(organizationId, owner.id, 'Scări metalice');
  const office = await createInstructionModule(
    organizationId,
    owner.id,
    'Activități de birou',
    'ssm',
    { body: officeWork, group: 'work_activity' }
  );
  const importId = await createLibraryImport({
    organizationId,
    createdBy: owner.id,
    legalName: bakery.legalName,
    cui: bakery.cui,
    posts: bakery.posts,
    proposal: await bakeryProposal({ ladders, office }),
  });

  await signIn(page, owner.email, `/clienti/import/${importId}`);
  const task = page.getByTestId('import-library-task');
  await expect(task).toHaveCount(1);
  await expect(task.getByTestId('library-part-status')).toHaveText('De verificat');
  await task.click();

  await expect(page.getByTestId('library-identical')).toContainText(
    'O instrucțiune din pachet este deja în biblioteca ta'
  );
  await expect(page.getByTestId('library-undecided')).toContainText('Vânzător');
  await expect(page.getByTestId('library-confirm')).toHaveText('Confirmă întâi clientul');
  await expect(page.getByTestId('library-confirm')).toBeDisabled();

  const rows = page.getByTestId('library-instruction');
  await expect(rows).toHaveCount(2);
  const oven = page.locator('[data-testid="library-instruction"][data-status="new"]');
  await expect(oven.getByTestId('library-instruction-flags')).toContainText(
    `Textul numește clientul ${bakery.legalName}`
  );
  const title = oven.getByTestId('library-instruction-title-input');
  await expect(title).toHaveValue('Utilizarea cuptorului de patiserie');
  await title.fill('Cuptorul de patiserie');
  await title.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Se salvează…' })).toHaveCount(0);

  await oven.getByTestId('library-instruction-pick-posts').click();
  const picker = page.getByTestId('library-posts-dialog');
  await expect(picker.getByTestId('library-post-option').first()).toContainText('Nedecis');
  await picker.getByRole('checkbox', { name: 'Vânzător' }).check();
  await picker.getByTestId('library-posts-save').click();
  await expect(oven.getByTestId('library-instruction-posts')).toHaveText('Brutar și Vânzător');

  const similar = page.locator('[data-testid="library-instruction"][data-status="similar"]');
  await expect(similar).toContainText(
    'Ai deja o instrucțiune care spune același lucru: Scări metalice'
  );
  await similar.getByTestId('library-instruction-compare').click();
  await expect(similar.getByTestId('library-difference')).toHaveCount(1);
  await expect(similar.getByTestId('library-choice-use_existing')).toBeChecked();
  await similar.getByTestId('library-choice-add_new').check();
  await expect(similar.getByTestId('library-instruction-title-input')).toHaveValue(
    `Scări metalice (${bakery.name})`
  );
  await expect(page.getByTestId('library-confirm-summary')).toContainText(
    'Se adaugă 2 instrucțiuni în bibliotecă, se folosește una pe care o ai, la 3 posturi.'
  );

  await page.reload();
  await expect(
    page
      .locator('[data-testid="library-instruction"][data-status="new"]')
      .getByTestId('library-instruction-title-input')
  ).toHaveValue('Cuptorul de patiserie');

  await page.goto(`/clienti/import/${importId}`);
  await page.getByTestId('import-confirm').click();
  await page.getByTestId('import-confirm-dialog').getByTestId('import-confirm-submit').click();
  await expect(page.getByTestId('import-confirmed-hub')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/clienti/import/${importId}$`));

  const clientId = await clientOfImport(importId);
  await page.goto(`/clienti/${clientId}/detalii`);
  const reminder = page.getByTestId('client-library-tasks-notice');
  await expect(reminder).toContainText('IPSSM: de verificat');
  await reminder.getByTestId('client-library-tasks-open').click();
  await page.getByTestId('import-library-task').click();
  await expect(page.getByTestId('library-confirm')).toHaveText('Confirmă IPSSM');
  await page.getByTestId('library-confirm').click();

  await expect(page.getByTestId('import-confirmed-hub')).toBeVisible();
  await expect(
    page.getByTestId('import-library-task').getByTestId('library-part-status')
  ).toHaveText('Confirmat');

  await page.goto('/instructiuni/ssm');
  const library = page.getByTestId('instruction-open');
  await expect(library.filter({ hasText: 'Cuptorul de patiserie' })).toHaveCount(1);
  await expect(library.filter({ hasText: `Scări metalice (${bakery.name})` })).toHaveCount(1);

  const seller = await jobPositionId(clientId, 'Vânzător');
  await page.goto(`/clienti/${clientId}/posturi/${seller}`);
  const card = page.getByTestId('instructions-card');
  await expect(card.getByTestId('instructions-row')).toHaveCount(1);
  await expect(card.getByTestId('instructions-row')).toContainText('Cuptorul de patiserie');
  const baker = await jobPositionId(clientId, 'Brutar');
  await page.goto(`/clienti/${clientId}/posturi/${baker}`);
  await expect(page.getByTestId('instructions-card').getByTestId('instructions-row')).toHaveCount(
    2
  );
  await page.goto(`/clienti/${clientId}/detalii`);
  await expect(page.getByTestId('client-library-tasks-notice')).toHaveCount(0);
});
