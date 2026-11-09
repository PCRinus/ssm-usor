import { expect, test } from '@playwright/test';

import {
  chambermaidExisting,
  hotel,
  hotelRisks,
  libraryCook,
  protectiveEquipmentRow,
} from './risks-pack';
import {
  cleanUp,
  clientOfImport,
  createAccount,
  createEvaluationProfile,
  createLibraryImport,
  createOrganization,
  evaluateJobPosition,
  jobPositionId,
  signIn,
} from './support';

test.afterAll(cleanUp);

// The risk evaluations of a client import (ADR 036, "The review"), seeded as the reading leaves
// them, since the local stack has no model to read a pack with.

test("a pack's risk evaluations are reviewed before the client is created, confirmed after it, and land in the library and on the client's sheets", async ({
  page,
}) => {
  const owner = await createAccount('import-risks', 'Ioana Popescu');
  const organizationId = await createOrganization('Evaluări din import E2E', owner.id);
  const cook = await createEvaluationProfile(organizationId, owner.id, 'Bucătar', libraryCook);
  const importId = await createLibraryImport({
    organizationId,
    createdBy: owner.id,
    legalName: hotel.legalName,
    cui: hotel.cui,
    posts: hotel.posts,
    risks: hotelRisks([cook]),
  });

  await signIn(page, owner.email, `/clienti/import/${importId}`);
  const task = page.getByTestId('import-library-task');
  await expect(task).toHaveCount(1);
  await expect(task.getByTestId('library-part-status')).toHaveText('De verificat');
  await task.click();

  await expect(page.getByTestId('library-confirm')).toHaveCount(0);
  await expect(page.getByTestId('library-confirm-bar')).toContainText('Confirmă întâi clientul.');
  await expect(page.getByTestId('library-back-to-import')).toHaveText('Înapoi la propunere');
  await expect(page.getByTestId('risk-import-sheet')).toHaveCount(6);
  await expect(page.getByTestId('risk-import-left')).toContainText('Mai ai de ales la 2 evaluări.');
  const sheet = (key: string) =>
    page.locator(`[data-testid="risk-import-sheet"][data-key="${key}"]`);

  const receptionist = sheet('receptionist');
  await expect(receptionist.getByTestId('risk-import-library')).toContainText(
    'Intră ca evaluare nouă, cu numele Recepționer.'
  );
  await expect(receptionist.getByTestId('risk-import-library').getByRole('radio')).toHaveCount(0);
  await expect(sheet('visitors').getByTestId('risk-import-library')).toHaveCount(0);
  await expect(sheet('visitors').getByTestId('risk-import-client-only')).toContainText(
    'rămâne doar la client'
  );
  await expect(receptionist.getByTestId('risk-import-factor-flags').first()).toContainText(
    'Nivel în document: 2, după metodă: 3'
  );
  const stairs = receptionist
    .getByTestId('risk-import-factor')
    .filter({ hasText: 'Deplasarea pe scări' });
  await expect(stairs.getByTestId('risk-import-factor-included')).not.toBeChecked();
  await expect(stairs).toContainText('Lipsește clasa de gravitate');
  await stairs.getByTestId('risk-import-factor-edit').click();
  const editor = page.getByTestId('risk-factor-dialog');
  await editor.getByTestId('risk-factor-gravity').selectOption('3');
  await editor.getByTestId('risk-factor-save').click();
  await expect(editor).toHaveCount(0);
  await expect(stairs.getByTestId('risk-import-factor-included')).toBeChecked();
  await expect(stairs).not.toContainText('Lipsește clasa de gravitate');
  await expect(receptionist.getByTestId('risk-import-factors-summary')).toHaveText(
    '6 preluați, 2 de verificat'
  );

  const planRows = receptionist.getByTestId('risk-import-plan-rows-row');
  await expect(planRows).toContainText(
    '2 rânduri din documente sunt pentru acest post, dar nu le-am putut lega de niciun factor de pe fișă.'
  );
  await expect(receptionist.getByTestId('risk-import-plan-rows')).toHaveCount(0);
  await receptionist.getByTestId('risk-import-plan-rows-toggle').click();
  await expect(receptionist.getByTestId('risk-import-plan-row')).toHaveCount(2);
  const equipment = receptionist
    .getByTestId('risk-import-plan-row')
    .filter({ hasText: protectiveEquipmentRow });
  await expect(equipment).toContainText(
    'Măsuri organizatorice: Instruirea personalului · Acțiuni: Alocarea fondurilor materiale necesare · Termen: Periodic'
  );
  await equipment.getByTestId('risk-import-plan-row-add').click();
  await expect(editor.getByTestId('risk-factor-description')).toHaveValue(protectiveEquipmentRow);
  await editor.getByTestId('risk-factor-component').selectOption('executant');
  await editor.getByTestId('risk-factor-group').click();
  await page.getByRole('option', { name: 'Omisiuni', exact: true }).click();
  await editor.getByTestId('risk-factor-gravity').selectOption('2');
  await editor.getByTestId('risk-factor-probability').selectOption('4');
  await editor.getByTestId('risk-factor-save').click();
  await expect(editor).toHaveCount(0);
  await expect(equipment).toContainText('Adăugat pe fișă ca factor.');
  await expect(equipment).toContainText('gravitate 2, probabilitate 4');
  await expect(planRows).toContainText('Ai adăugat un factor din ele.');
  await expect(receptionist.getByTestId('risk-import-factors-summary')).toHaveText(
    '6 preluați, 2 de verificat'
  );

  const loose = page.getByTestId('risk-import-loose-rows');
  await expect(loose).toContainText('Rânduri pe care nu le preluăm');
  const loosePlan = loose.getByTestId('risk-import-loose-plan');
  await expect(loosePlan).toContainText('Din planul de prevenire');
  await expect(loosePlan.getByTestId('risk-import-loose-row')).toHaveCount(1);
  await expect(loosePlan.getByTestId('risk-import-loose-row')).toContainText(
    'Montarea de amortizoare la mașinile de spălat'
  );
  await expect(loose.getByTestId('risk-import-loose-unplaced')).toContainText(
    'Expunere la zgomot în spălătorie'
  );

  const cookSheet = sheet('cook');
  await expect(cookSheet.getByTestId('risk-import-similar')).toContainText(
    'Ai deja o evaluare asemănătoare: Bucătar'
  );
  await expect(cookSheet.getByTestId('risk-import-sheet-pending')).toHaveText(
    'Mai ai de ales ce intră în bibliotecă'
  );
  await cookSheet.getByTestId('risk-import-compare').click();
  await expect(cookSheet.getByTestId('risk-difference')).toHaveCount(3);
  await expect(cookSheet.getByTestId('risk-differences')).toContainText(
    'Electrocutarea la atingerea aparatelor electrice cu mâinile ude'
  );
  await cookSheet.getByTestId('risk-import-library-use_existing').check();
  await expect(cookSheet.getByTestId('risk-import-sheet-pending')).toHaveText('Gata de confirmat');
  await expect(cookSheet.getByTestId('risk-import-sheet-rename')).toHaveCount(0);

  const roomService = sheet('room-service');
  await expect(roomService.getByTestId('risk-import-client')).toContainText('Ospătar room-service');
  await roomService.getByTestId('risk-import-library-only').click();
  await expect(roomService.getByTestId('risk-import-posts')).toHaveText(
    'Niciun post: rămâne doar în bibliotecă.'
  );

  const chambermaid = sheet('chambermaid');
  const existing = chambermaid.getByTestId('risk-import-existing');
  await expect(existing).toContainText(`Postul are deja o fișă cu ${chambermaidExisting} factori.`);
  await expect(existing.getByTestId('risk-import-existing-keep')).toBeChecked();
  await existing.getByTestId('risk-import-existing-append').check();

  await expect(page.getByTestId('risk-import-left')).toContainText('Ai ales tot ce era de ales.');
  await page.getByTestId('import-action-details').locator('summary').click();
  await expect(page.getByTestId('import-action-details')).toContainText(
    'Când confirmi, adăugăm „Recepționer”, „Cameristă” și „Ospătar room-service” în bibliotecă, folosim „Bucătar” din biblioteca ta și scriem 19 factori pe 5 fișe ale clientului.'
  );
  await expect(page.getByRole('status').filter({ hasText: 'Se salvează…' })).toHaveCount(0);

  await page.reload();
  await expect(sheet('receptionist').getByTestId('risk-import-factors-summary')).toHaveText(
    '6 preluați, 2 de verificat'
  );
  await expect(sheet('cook').getByTestId('risk-import-library-use_existing')).toBeChecked();
  await expect(sheet('receptionist').getByTestId('risk-import-plan-rows-row')).toContainText(
    'Ai adăugat un factor din ele.'
  );

  await page.goto(`/clienti/import/${importId}`);
  await page.getByTestId('import-confirm').click();
  const confirmDialog = page.getByTestId('import-confirm-dialog');
  await expect(confirmDialog.getByTestId('import-confirm-library')).toContainText(
    'Evaluările de risc din pachet le confirmi după'
  );
  await confirmDialog.getByTestId('import-confirm-submit').click();
  await expect(page.getByTestId('import-confirmed-hub')).toBeVisible();

  const clientId = await clientOfImport(importId);
  const chambermaidPost = await jobPositionId(clientId, 'Cameristă');
  await evaluateJobPosition(organizationId, clientId, chambermaidPost);

  await page.goto(`/clienti/${clientId}/detalii`);
  await expect(page.getByTestId('client-import-row')).toHaveAttribute('data-outcome', 'open');
  const reminder = page.getByTestId('client-library-tasks-notice');
  await expect(reminder).toContainText('Evaluări de risc: de verificat');
  await reminder.getByTestId('client-library-tasks-open').click();
  await expect(page.getByTestId('import-next-step-open')).toHaveText('Verifică evaluările');
  await page.getByTestId('import-next-step-open').click();
  await expect(page.getByTestId('library-confirm')).toHaveText('Confirmă evaluările');
  await page.getByTestId('library-confirm').click();

  await expect(page.getByTestId('import-finished')).toContainText(
    'Datele clientului și evaluările de risc sunt preluate.'
  );
  await expect(page.getByTestId('import-done-part')).toHaveAttribute(
    'data-part',
    'risk_evaluations'
  );

  await page.goto('/evaluari-de-risc');
  const entries = page.getByTestId('risk-profile-row');
  await expect(entries.filter({ hasText: 'Recepționer' })).toHaveCount(1);
  await expect(entries.filter({ hasText: 'Ospătar room-service' })).toHaveCount(1);
  await expect(entries.filter({ hasText: 'Cameristă' })).toHaveCount(1);
  await expect(entries.filter({ hasText: 'Bucătar' })).toHaveCount(1);

  const receptionistPost = await jobPositionId(clientId, 'Recepționer');
  await page.goto(`/clienti/${clientId}/posturi/${receptionistPost}/fisa-de-evaluare`);
  await expect(page.getByTestId('risk-factor-row')).toHaveCount(7);
  await expect(
    page.getByTestId('risk-factor-row').filter({ hasText: protectiveEquipmentRow })
  ).toHaveCount(1);
  await expect(page.getByTestId('risk-factors-origin')).toHaveText(
    'Toți cei 7 factori sunt în evaluarea Recepționer din bibliotecă.'
  );

  const cookPost = await jobPositionId(clientId, 'Bucătar');
  await page.goto(`/clienti/${clientId}/posturi/${cookPost}/fisa-de-evaluare`);
  await expect(page.getByTestId('risk-factor-row')).toHaveCount(5);
  await expect(page.getByTestId('risk-factors-origin')).toHaveText(
    '4 factori sunt în evaluarea Bucătar; unul nu este în bibliotecă.'
  );

  await page.goto(`/clienti/${clientId}/posturi/${chambermaidPost}/fisa-de-evaluare`);
  await expect(page.getByTestId('risk-factor-row')).toHaveCount(chambermaidExisting + 3);

  await page.goto(`/clienti/${clientId}/detalii`);
  await expect(page.getByTestId('client-import-row')).toHaveAttribute('data-outcome', 'done');
  await expect(page.getByTestId('client-library-tasks-notice')).toHaveCount(0);
});
