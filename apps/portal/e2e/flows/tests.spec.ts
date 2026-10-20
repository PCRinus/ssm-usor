import { expect, type Page, test } from '@playwright/test';

import {
  addEmployee,
  addressOf,
  answerKey,
  api,
  cleanUp,
  createProvider,
  inviteByEmail,
  lastSignInCode,
} from './support';

test.afterAll(cleanUp);

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByTestId('sign-in-address').fill(email);
  await page.getByTestId('sign-in-request').click();
  await expect.poll(() => lastSignInCode(email).catch(() => null)).not.toBeNull();
  await page.getByTestId('sign-in-code').fill(await lastSignInCode(email));
  await page.getByTestId('sign-in-code').press('Enter');
  await page.getByTestId('privacy-notice-accept').click();
  await expect(page.getByTestId('portal-home')).toBeVisible();
}

async function answer(page: Page, key: Map<string, string[]>, position: number) {
  await expect(page.getByTestId('test-counter')).toHaveText(`${position} din 10`);
  const question = (await page.getByTestId('test-question').textContent())!.trim();
  const correct = key.get(question);
  expect(correct, `the bank holds "${question}"`).toBeDefined();
  await expect(page.getByTestId(position === 10 ? 'test-submit' : 'test-next')).toBeDisabled();
  for (const text of correct!) {
    await page
      .getByTestId('test-option')
      .filter({ has: page.getByText(text, { exact: true }) })
      .click();
  }
  await page.getByTestId(position === 10 ? 'test-submit' : 'test-next').click();
}

test('an employee with an awaiting hiring test reads the study card, answers ten questions and passes', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const provider = await createProvider('Prevenție Teste E2E', 'Atelier Teste E2E S.R.L.');
  const email = addressOf('testat');
  const employeeId = await addEmployee(provider, {
    lastName: 'Pop',
    firstName: 'Ana',
    email,
    jobTitle: 'Tâmplar',
  });
  await inviteByEmail(provider, employeeId, email);
  await api(`/clients/${provider.clientId}/trainings`, provider.token, {
    method: 'POST',
    body: {
      domain: 'ssm',
      phase: 'introductory_general',
      heldOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date()),
      durationMinutes: 240,
      material: 'Conform MISSMIG Art. 1 – 325',
      trainer: { name: 'Ana Ionescu', jobTitle: 'Inspector SSM' },
      verifier: { name: 'Ana Ionescu', jobTitle: 'Inspector SSM' },
      employeeIds: [employeeId],
    },
  });
  const key = await answerKey(provider.organizationId, 'ssm', 'hiring');

  await signIn(page, email);
  const awaiting = page.getByTestId('home-test-item');
  await expect(awaiting).toHaveCount(1);
  await expect(awaiting).toHaveAttribute('data-domain', 'ssm');
  await expect(awaiting).toContainText('Testul la angajare SSM te așteaptă');
  await awaiting.click();

  await expect(page).toHaveURL(/\/instruiri\/test\/ssm\/hiring$/);
  await expect(page.getByTestId('portal-bar-instruiri')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('test-page').getByRole('heading', { level: 1 })).toHaveText(
    'Testul la angajare SSM'
  );
  await expect(page.getByTestId('study-card-explanation').first()).toBeVisible();
  await expect(page.getByTestId('test-material-missing')).toContainText(
    'Materialul de instruire nu este emis încă'
  );
  await expect(page.getByTestId('test-start')).toHaveText('Începe testul');
  await page.getByTestId('test-start').click();

  for (let position = 1; position <= 5; position += 1) await answer(page, key, position);
  await expect(page.getByTestId('test-counter')).toHaveText('6 din 10');

  await page.reload();
  await expect(page.getByTestId('test-start')).toHaveText('Continuă testul');
  await page.getByTestId('test-start').click();
  for (let position = 6; position <= 10; position += 1) await answer(page, key, position);

  const result = page.getByTestId('test-result');
  await expect(result).toHaveAttribute('data-passed', 'true');
  await expect(result.getByRole('heading', { level: 1 })).toHaveText('Ai promovat testul');
  await expect(page.getByTestId('test-score')).toHaveText('10 din 10 răspunsuri corecte');

  await page.getByTestId('test-result-trainings').click();
  await expect(page.getByTestId('training-test-state-ssm')).toHaveText('Promovat');
  await expect(page.getByTestId('training-test-result')).toContainText('Testul la angajare SSM');
  await expect(page.getByTestId('training-test-result')).toContainText('Admis');
  await expect(page.getByTestId('training-test-open-ssm')).toHaveCount(0);

  await page.getByTestId('portal-bar-home').click();
  await expect(page.getByTestId('portal-home')).toBeVisible();
  await expect(page.getByTestId('home-tests')).toHaveCount(0);
});
