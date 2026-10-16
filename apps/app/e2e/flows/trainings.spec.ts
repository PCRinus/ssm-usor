import { expect, test } from '@playwright/test';

import {
  accessTokenOf,
  cleanUp,
  createAccount,
  createClientCompany,
  createEmployee,
  createJobPosition,
  createOrganization,
  updateClient,
} from './support';

test.afterAll(cleanUp);

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

// Training records (ADR 021) through the API of the local stack, without a page.
test('a training held gives its attendee a record and ends their untrained state', async () => {
  const owner = await createAccount('trainings', 'Dan MARIN');
  const organizationId = await createOrganization('Instruiri E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT INSTRUIRI E2E S.R.L.');
  await updateClient(clientId, { worker_training_interval_months: 3 });
  const positionId = await createJobPosition(organizationId, clientId, 'Sudor');
  await createEmployee(organizationId, clientId, {
    firstName: 'Ion',
    lastName: 'Instruitu',
    jobTitle: 'Sudor',
  });
  const token = await accessTokenOf(owner.email);
  const api = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(new URL(`/clients/${clientId}${path}`, process.env.E2E_API_URL), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  };

  const untrained = await api('/employees?trainingState=untrained');
  expect(untrained.status).toBe(200);
  expect(untrained.body.items).toHaveLength(1);
  const employee = untrained.body.items[0];
  expect(employee.training.ssm).toEqual({
    state: 'untrained',
    dueOn: null,
    lastPeriodicOn: null,
    intervalMonths: 3,
    intervalSource: 'client',
  });
  expect(employee.training.psi.state).toBe('untrained');

  const proposal = await api(
    `/trainings/proposal?domain=ssm&phase=workplace&heldOn=${today}&jobPositionId=${positionId}`
  );
  expect(proposal.status).toBe(200);
  expect(proposal.body).toMatchObject({
    durationMinutes: 240,
    material: expect.stringContaining('I.P.S.S.M. Art. 1 – 290'),
    trainer: { name: 'Maria Popescu', jobTitle: null },
    verifier: { name: 'Dan MARIN', jobTitle: null },
    admittedBy: { name: 'Maria Popescu', jobTitle: null },
    themesRevisionId: null,
  });

  const created = await api('/trainings', {
    method: 'POST',
    body: JSON.stringify({
      domain: 'ssm',
      phase: 'workplace',
      heldOn: today,
      durationMinutes: proposal.body.durationMinutes,
      material: proposal.body.material,
      trainer: { name: 'Maria Popescu', jobTitle: 'Administrator' },
      verifier: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
      employeeIds: [employee.id],
      admission: { admittedOn: today, name: 'Maria Popescu', jobTitle: 'Administrator' },
    }),
  });
  expect(created.status).toBe(201);
  expect(created.body.training.records).toEqual([
    expect.objectContaining({
      employee: { id: employee.id, lastName: 'Instruitu', firstName: 'Ion' },
      occupation: 'Sudor',
      admission: { admittedOn: today, name: 'Maria Popescu', jobTitle: 'Administrator' },
    }),
  ]);

  const records = await api(`/employees/${employee.id}/training-records?domain=ssm`);
  expect(records.status).toBe(200);
  expect(records.body.items).toHaveLength(1);
  expect(records.body.items[0].training).toMatchObject({ phase: 'workplace', heldOn: today });

  const detail = await api(`/employees/${employee.id}`);
  expect(detail.body.employee.training.ssm.state).toBe('current');
  expect(detail.body.employee.training.ssm.dueOn > today).toBe(true);
  expect(detail.body.employee.training.psi.state).toBe('untrained');

  const listed = await api('/trainings?domain=ssm');
  expect(listed.body.items).toEqual([
    expect.objectContaining({ id: created.body.training.id, attendeeCount: 1 }),
  ]);
  expect((await api('/employees?trainingState=overdue')).body.items).toHaveLength(0);
  // Still untrained in fire safety, which the filter matches in either domain.
  expect((await api('/employees?trainingState=untrained')).body.items).toHaveLength(1);

  expect((await api(`/trainings/${created.body.training.id}`, { method: 'DELETE' })).status).toBe(
    204
  );
  expect((await api(`/employees/${employee.id}/training-records`)).body.items).toEqual([]);
});
