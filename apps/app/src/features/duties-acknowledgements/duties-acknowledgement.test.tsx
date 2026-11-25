import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { DutiesAcknowledgementResponse, EmployeeResponseEmployee } from '@/api/generated/api';
import { installFetchMock, mockApi as mockRoutes, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import {
  clientId,
  clientRecord,
  dutiesNotIssued,
  employeeId,
  employeeRecord,
  jobPositionId,
  jobPositionRecord,
} from '@/test/records';
import { employeeTests } from '@/test/training-fixture';

const employeePath = `/clients/${clientId}/employees/${employeeId}`;
const dutiesPath = `${employeePath}/duties-acknowledgement`;
const ssmTab = `/clienti/${clientId}/angajati/${employeeId}/instruire/ssm`;

const documentId = '3b6f0a1c-2d4e-4f5a-8b7c-9d0e1f2a3b4c';
const revisionId = '4c7a1b2d-3e5f-4a6b-8c7d-0e1f2a3b4c5d';
const oldRevisionId = '5d8b2c3e-4f6a-4b7c-9d8e-1f2a3b4c5d6e';
const recordId = '6e9c3d4f-5a7b-4c8d-8e9f-2a3b4c5d6e7f';
const fileId = '7fad4e5a-6b8c-4d9e-9fa0-3b4c5d6e7f80';

const worker = employeeRecord({
  lastName: 'Ionescu',
  firstName: 'Maria',
  jobPosition: { id: jobPositionId, name: 'Brutar', archived: false },
});

const annex = (overrides: Partial<NonNullable<DutiesAcknowledgementResponse['annex']>> = {}) => ({
  documentId,
  revisionId,
  issueDate: '2026-11-24',
  number: 2,
  position: { id: jobPositionId, name: 'Brutar' },
  roles: [],
  ...overrides,
});

const record = (
  overrides: Partial<NonNullable<DutiesAcknowledgementResponse['current']>> = {}
) => ({
  id: recordId,
  state: 'signed_on_paper' as const,
  signedAt: '2026-11-26T10:00:00.000Z',
  signedOn: '2026-11-26',
  clientFileId: null,
  annex: annex(),
  recordedAt: '2026-11-26T12:00:00.000Z',
  recordedBy: null,
  ...overrides,
});

const revision = { documentId, revisionId, issueDate: '2026-11-24' };

const toSign: DutiesAcknowledgementResponse = {
  status: 'to_sign',
  reasons: [],
  revision,
  annex: annex(),
  current: null,
  history: [],
};

const scanFile = {
  id: fileId,
  name: 'Fișa atribuțiilor SSM semnată',
  note: null,
  ownersOnly: false,
  employee: { id: employeeId, lastName: 'Ionescu', firstName: 'Maria' },
  originalFileName: 'fisa.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1200,
  sha256: 'a'.repeat(64),
  uploadedBy: null,
  canChange: true,
  createdAt: '2026-11-26T08:00:00.000Z',
  updatedAt: '2026-11-26T08:00:00.000Z',
  link: {
    url: `http://127.0.0.1:54321/storage/v1/object/sign/client-files/${fileId}`,
    fileName: 'fisa.pdf',
    disposition: 'inline',
    expiresInSeconds: 600,
  },
};

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

function mockApi({
  duties,
  employee = worker,
  archived = false,
  routes = {},
}: {
  duties: () => DutiesAcknowledgementResponse;
  employee?: EmployeeResponseEmployee;
  archived?: boolean;
  routes?: Partial<Record<string, Handler>>;
}) {
  const client = clientRecord({ archivedAt: archived ? '2026-11-01T10:00:00.000Z' : null });
  mockRoutes((init, url) => {
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const route = routes[key];
    if (route) return route(init);
    switch (key) {
      case `GET /clients/${clientId}`:
        return Response.json({ client });
      case `GET ${employeePath}`:
        return Response.json({ employee });
      case `GET ${employeePath}/training-records`:
        return Response.json({ items: [] });
      case `GET ${employeePath}/tests`:
        return Response.json(employeeTests());
      case `GET ${employeePath}/training-sheets`:
        return Response.json({
          ssm: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
          su: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
        });
      case `GET ${employeePath}/participant`:
        return Response.json({ participant: null, invitation: null });
      case `GET ${employeePath}/signing-agreement/state`:
        return Response.json({ agreement: null, unavailable: null });
      case `GET ${dutiesPath}`:
        return Response.json(duties());
      case `GET /clients/${clientId}/files`:
        return Response.json({ items: [scanFile] });
      case `GET /clients/${clientId}/job-positions`:
        return Response.json({
          items: [jobPositionRecord({ id: jobPositionId, name: 'Brutar' })],
        });
      default:
        return undefined;
    }
  });
}

installFetchMock();

const open = () => mountApp(authFixture(makeSession()).client, ssmTab);

const card = () => screen.findByTestId('duties-acknowledgement-card');

const actionLabels = (element: HTMLElement) =>
  Array.from(
    within(element).queryByTestId('duties-acknowledgement-actions')?.querySelectorAll('button') ??
      []
  ).map((button) => button.textContent);

const rowLabels = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('dt')).map((term) => term.textContent);

const posts = () =>
  requestsTo(`${dutiesPath}/records`, 'POST').map(([, init]) =>
    JSON.parse(String(init?.body))
  ) as unknown[];

const isoDaysAgo = (days: number) => {
  const day = new Date();
  day.setDate(day.getDate() - days);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
};
const roDate = (iso: string) => iso.split('-').reverse().join('.');

async function typeDate(field: HTMLElement, iso: string) {
  const user = userEvent.setup();
  await user.clear(field);
  await user.type(field, roDate(iso));
  await user.tab();
}

describe('the acknowledgement sheet on the Instruire SSM tab', () => {
  it('sits under the training state, and its buttons leave the dark one to the training', async () => {
    mockApi({ duties: () => toSign });
    open();
    const tab = await screen.findByTestId('employee-training-tab');
    const section = await card();
    expect(section.previousElementSibling?.getAttribute('data-testid')).toBe('training-status');
    await within(section).findByTestId('duties-acknowledgement-state');
    expect(
      Array.from(tab.querySelectorAll('button, a'))
        .filter((element) => element.getAttribute('data-variant') === 'default')
        .map((element) => element.getAttribute('data-testid'))
    ).toEqual(['training-record']);
    expect(
      Array.from(section.querySelectorAll('[data-testid="duties-acknowledgement-actions"] button'))
        .map((button) => button.getAttribute('data-variant'))
        .every((variant) => variant === 'secondary')
    ).toBe(true);
  });

  it('is not on the Instruire SU tab', async () => {
    mockApi({ duties: () => toSign });
    mountApp(
      authFixture(makeSession()).client,
      `/clienti/${clientId}/angajati/${employeeId}/instruire/su`
    );
    await screen.findByTestId('employee-training-tab');
    expect(screen.queryByTestId('duties-acknowledgement-card')).toBeNull();
    expect(requestsTo(dutiesPath)).toHaveLength(0);
  });

  it('asks for a sheet to sign, naming the annex, the post and the roles', async () => {
    mockApi({
      duties: () => ({
        ...toSign,
        annex: annex({ roles: ['workplace_manager', 'imminent_danger'] }),
      }),
    });
    open();
    const section = await card();
    const state = await within(section).findByTestId('duties-acknowledgement-state');
    expect(state.textContent).toBe('De semnat');
    expect(rowLabels(section)).toEqual(['Stare', 'Fișa', 'Ce urmează']);
    expect(within(section).getByTestId('duties-acknowledgement-sheet').textContent).toBe(
      'FișaAnexa 2 din documentul 13, emis la 24.11.2026Postul Brutar, cu rolurile conducătorul locului de muncă și pericol grav și iminent'
    );
    expect(
      within(section).getByTestId('duties-acknowledgement-document').getAttribute('href')
    ).toBe(`/clienti/${clientId}/documente-ssm/${documentId}`);
    expect(within(section).getByTestId('duties-acknowledgement-next').textContent).toBe(
      'Descarc-o și dă-o lucrătorului s-o semneze de mână. Apoi înregistreaz-o aici, cu ziua semnării.'
    );
    expect(actionLabels(section)).toEqual([
      'Descarcă fișa pentru semnare pe hârtie',
      'Înregistrează fișa semnată pe hârtie…',
    ]);
  });

  it('downloads the sheet as a PDF', async () => {
    mockApi({
      duties: () => toSign,
      routes: {
        [`GET ${dutiesPath}/sheet`]: () =>
          new Response(new Uint8Array([37, 80, 68, 70]), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'attachment; filename="Fisa-atributii-SSM.pdf"',
            },
          }),
      },
    });
    open();
    const section = await card();
    await userEvent
      .setup()
      .click(await within(section).findByTestId('duties-acknowledgement-download'));
    await waitFor(() => expect(requestsTo(`${dutiesPath}/sheet`)).toHaveLength(1));
  });

  it('shows a sheet signed on paper with its day and scan', async () => {
    mockApi({
      duties: () => ({
        ...toSign,
        status: 'signed',
        current: record({ clientFileId: fileId }),
      }),
    });
    open();
    const section = await card();
    const state = await within(section).findByTestId('duties-acknowledgement-state');
    expect(state.textContent).toBe('Semnată pe hârtie');
    expect(within(section).getByTestId('duties-acknowledgement-detail').textContent).toBe(
      'pe 26.11.2026'
    );
    expect(rowLabels(section)).toEqual(['Stare', 'Fișa', 'Scan']);
    expect(
      (await within(section).findByTestId('duties-acknowledgement-scan-link')).textContent
    ).toBe('Fișa atribuțiilor SSM semnată');
    expect(actionLabels(section)).toEqual(['Descarcă fișa', 'Șterge înregistrarea…']);
  });

  it('says a sheet signed without a scan has none attached', async () => {
    mockApi({ duties: () => ({ ...toSign, status: 'signed', current: record() }) });
    open();
    const section = await card();
    expect((await within(section).findByTestId('duties-acknowledgement-scan')).textContent).toBe(
      'ScanFără scan atașat'
    );
  });

  it.each([
    [['annex_changed'], 'Anexa postului s-a schimbat în documentul 13 emis la 24.11.2026.'],
    [['roles_changed'], 'Rolurile lucrătorului s-au schimbat de la semnare.'],
    [
      ['annex_changed', 'roles_changed'],
      'Anexa postului s-a schimbat în documentul 13 emis la 24.11.2026, iar rolurile lucrătorului s-au schimbat de la semnare.',
    ],
  ] as const)(
    'asks to sign again, saying why (%s), with the earlier sheet',
    async (reasons, why) => {
      mockApi({
        duties: () => ({
          ...toSign,
          status: 'sign_again',
          reasons: [...reasons],
          current: record({
            signedOn: '2026-06-12',
            clientFileId: fileId,
            annex: annex({ revisionId: oldRevisionId, issueDate: '2026-06-10' }),
          }),
        }),
      });
      open();
      const section = await card();
      const state = await within(section).findByTestId('duties-acknowledgement-state');
      expect(state.textContent).toBe('De semnat din nou');
      expect(state.className).toContain('text-warning-foreground');
      expect(within(section).getByTestId('duties-acknowledgement-detail').textContent).toBe(why);
      expect(rowLabels(section)).toEqual(['Stare', 'Fișa nouă', 'Semnată anterior', 'Ce urmează']);
      const earlier = within(section).getByTestId('duties-acknowledgement-earlier');
      await within(earlier).findByText('scanul fișei');
      expect(earlier.textContent).toBe(
        'Semnată anteriorAnexa 2 din documentul 13, emis la 10.06.2026pe hârtie, pe 12.06.2026 · scanul fișei'
      );
      expect(within(section).getByTestId('duties-acknowledgement-next').textContent).toBe(
        'Descarcă fișa nouă și dă-o lucrătorului s-o semneze. Cea veche rămâne la dosar.'
      );
      expect(actionLabels(section)).toEqual([
        'Descarcă fișa pentru semnare pe hârtie',
        'Înregistrează fișa semnată pe hârtie…',
      ]);
    }
  );

  it('points to the documentation while document 13 is not issued', async () => {
    mockApi({ duties: () => dutiesNotIssued });
    open();
    const section = await card();
    const missing = await within(section).findByTestId('duties-acknowledgement-missing');
    expect(missing.textContent).toContain(
      'Documentul 13, cu atribuțiile SSM ale posturilor, nu este emis încă.'
    );
    expect(
      within(missing).getByRole('link', { name: 'Deschide Documentație SSM' }).getAttribute('href')
    ).toBe(`/clienti/${clientId}/documente-ssm`);
    expect(actionLabels(section)).toEqual([]);
  });

  it('asks to issue document 13 again for a post newer than it', async () => {
    mockApi({
      duties: () => ({
        ...dutiesNotIssued,
        status: 'no_annex',
        revision: { ...revision, issueDate: '2026-06-10' },
      }),
    });
    open();
    const section = await card();
    const missing = await within(section).findByTestId('duties-acknowledgement-missing');
    expect(missing.textContent).toContain(
      'Postul Brutar nu are anexă în documentul 13, emis la 10.06.2026, înaintea postului. Emite din nou documentul 13.'
    );
    expect(within(missing).getByRole('link', { name: 'Deschide Documentație SSM' })).toBeTruthy();
  });

  it('offers to move a worker whose post is archived', async () => {
    mockApi({
      duties: () => ({ ...dutiesNotIssued, status: 'no_annex', revision }),
      employee: {
        ...worker,
        jobPosition: { id: jobPositionId, name: 'Ajutor brutar', archived: true },
      },
    });
    open();
    const section = await card();
    const missing = await within(section).findByTestId('duties-acknowledgement-missing');
    expect(missing.textContent).toContain(
      'Postul lucrătorului, Ajutor brutar, e arhivat, deci nu are anexă în documentul 13. Mută lucrătorul pe un post curent.'
    );
    await userEvent.setup().click(within(missing).getByTestId('duties-acknowledgement-move-post'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('reads the sheet of an archived client without a step to take', async () => {
    mockApi({ duties: () => toSign, archived: true });
    open();
    const section = await card();
    await within(section).findByTestId('duties-acknowledgement-state');
    expect(within(section).getByTestId('duties-acknowledgement-detail').textContent).toBe(
      'Clientul e arhivat: fișa nu se mai semnează.'
    );
    expect(within(section).queryByTestId('duties-acknowledgement-next')).toBeNull();
    expect(actionLabels(section)).toEqual([]);
  });

  it('reads a former worker’s sheet without a step to take', async () => {
    mockApi({
      duties: () => ({ ...toSign, status: 'signed', current: record() }),
      employee: { ...worker, status: 'terminated', terminatedAt: '2026-11-20' },
    });
    open();
    const section = await card();
    await within(section).findByTestId('duties-acknowledgement-state');
    expect(actionLabels(section)).toEqual(['Descarcă fișa']);
  });
});

describe('the dialog of a sheet signed on paper', () => {
  it('records the day and a scan chosen among the worker’s files, for the revision shown', async () => {
    let signed = false;
    const signedOn = isoDaysAgo(1);
    mockApi({
      duties: () =>
        signed
          ? { ...toSign, status: 'signed', current: record({ signedOn, clientFileId: fileId }) }
          : { ...toSign, annex: annex({ issueDate: isoDaysAgo(5) }) },
      routes: {
        [`POST ${dutiesPath}/records`]: () => {
          signed = true;
          return Response.json(toSign);
        },
      },
    });
    const user = userEvent.setup();
    open();
    const section = await card();
    await user.click(await within(section).findByTestId('duties-acknowledgement-paper'));
    const dialog = await screen.findByTestId('duties-acknowledgement-paper-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Fișa semnată pe hârtie');
    expect(dialog.textContent).toContain(
      'Fișa de luare la cunoștință a atribuțiilor SSM semnată de mână de Ionescu Maria.'
    );
    expect(dialog.textContent).toContain('Scanul fișei');
    const date = within(dialog).getByTestId('duties-acknowledgement-signed-on');
    expect((date as HTMLInputElement).value).toBe(roDate(isoDaysAgo(0)));
    await typeDate(date, signedOn);
    const existing = within(dialog).getByTestId('duties-acknowledgement-file-existing');
    await waitFor(() => expect(existing).toHaveProperty('disabled', false));
    await user.selectOptions(existing, fileId);
    await user.click(within(dialog).getByTestId('duties-acknowledgement-paper-submit'));
    await waitFor(() =>
      expect(screen.queryByTestId('duties-acknowledgement-paper-dialog')).toBeNull()
    );
    expect(posts()).toEqual([{ revisionId, signedOn, clientFileId: fileId }]);
    await waitFor(() =>
      expect(within(section).getByTestId('duties-acknowledgement-state').textContent).toBe(
        'Semnată pe hârtie'
      )
    );
  });

  it('uploads a new scan as a file of the worker before recording it', async () => {
    let uploaded = false;
    mockApi({
      duties: () => toSign,
      routes: {
        [`POST /clients/${clientId}/files`]: () => {
          uploaded = true;
          return Response.json({ file: scanFile }, { status: 201 });
        },
        [`POST ${dutiesPath}/records`]: () => Response.json(toSign),
      },
    });
    const user = userEvent.setup();
    open();
    const section = await card();
    await user.click(await within(section).findByTestId('duties-acknowledgement-paper'));
    const dialog = await screen.findByTestId('duties-acknowledgement-paper-dialog');
    await user.upload(
      within(dialog).getByTestId('duties-acknowledgement-file-input'),
      new File(['%PDF-1.7'], 'fisa-semnata.pdf', { type: 'application/pdf' })
    );
    await user.click(within(dialog).getByTestId('duties-acknowledgement-paper-submit'));
    await waitFor(() =>
      expect(screen.queryByTestId('duties-acknowledgement-paper-dialog')).toBeNull()
    );
    expect(uploaded).toBe(true);
    const [upload] = requestsTo(`/clients/${clientId}/files`, 'POST');
    const url = new URL(String(upload![0]));
    expect(url.searchParams.get('employeeId')).toBe(employeeId);
    expect(url.searchParams.get('fileName')).toBe('fisa-semnata.pdf');
    expect(posts()).toEqual([{ revisionId, signedOn: isoDaysAgo(0), clientFileId: fileId }]);
  });

  it('refuses a day in the future or before document 13 was issued, without asking the API', async () => {
    mockApi({ duties: () => ({ ...toSign, annex: annex({ issueDate: isoDaysAgo(3) }) }) });
    const user = userEvent.setup();
    open();
    const section = await card();
    await user.click(await within(section).findByTestId('duties-acknowledgement-paper'));
    const dialog = await screen.findByTestId('duties-acknowledgement-paper-dialog');
    const date = within(dialog).getByTestId('duties-acknowledgement-signed-on');

    await typeDate(date, isoDaysAgo(-2));
    await user.click(within(dialog).getByTestId('duties-acknowledgement-paper-submit'));
    expect(dialog.textContent).toContain('Data semnării nu poate fi în viitor.');

    await typeDate(date, isoDaysAgo(6));
    await user.click(within(dialog).getByTestId('duties-acknowledgement-paper-submit'));
    expect(dialog.textContent).toContain(
      `Data semnării nu poate fi înaintea emiterii documentului 13, pe ${roDate(isoDaysAgo(3))}.`
    );
    expect(posts()).toEqual([]);
  });

  it('says so when document 13 was issued again meanwhile, and stays open', async () => {
    mockApi({
      duties: () => toSign,
      routes: {
        [`POST ${dutiesPath}/records`]: () =>
          Response.json(
            {
              error: 'conflict',
              message: 'Not current.',
              reason: 'duties_revision_not_current',
            },
            { status: 409 }
          ),
      },
    });
    const user = userEvent.setup();
    open();
    const section = await card();
    await user.click(await within(section).findByTestId('duties-acknowledgement-paper'));
    const dialog = await screen.findByTestId('duties-acknowledgement-paper-dialog');
    await user.click(within(dialog).getByTestId('duties-acknowledgement-paper-submit'));
    expect((await within(dialog).findByTestId('duties-acknowledgement-error')).textContent).toBe(
      'Documentul 13 a fost emis din nou între timp. Descarcă fișa nouă și dă-o lucrătorului la semnat.'
    );
    expect(screen.getByTestId('duties-acknowledgement-paper-dialog')).toBeTruthy();
  });

  it('removes a record made by mistake, after asking', async () => {
    let removed = false;
    mockApi({
      duties: () => (removed ? toSign : { ...toSign, status: 'signed', current: record() }),
      routes: {
        [`DELETE ${dutiesPath}/records/${recordId}`]: () => {
          removed = true;
          return Response.json(toSign);
        },
      },
    });
    const user = userEvent.setup();
    open();
    const section = await card();
    await user.click(await within(section).findByTestId('duties-acknowledgement-remove'));
    const dialog = await screen.findByTestId('duties-acknowledgement-remove-dialog');
    expect(dialog.textContent).toContain('scanul ei rămâne în Documente');
    await user.click(within(dialog).getByTestId('duties-acknowledgement-remove-confirm'));
    await waitFor(() =>
      expect(within(section).getByTestId('duties-acknowledgement-state').textContent).toBe(
        'De semnat'
      )
    );
    expect(requestsTo(`${dutiesPath}/records/${recordId}`, 'DELETE')).toHaveLength(1);
  });
});
