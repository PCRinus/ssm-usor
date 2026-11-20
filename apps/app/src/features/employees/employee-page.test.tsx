import type { MissingSheetData } from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type {
  EmployeeParticipantState,
  EmployeeResponseEmployee,
  SigningAgreementResponse,
} from '@/api/generated/api';
import { formatDate, todayIso } from '@/lib/dates';
import { installFetchMock, mockApi } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import {
  clientId,
  clientRecord,
  employeeId,
  employeeRecord,
  jobPositionId,
  jobPositionRecord,
} from '@/test/records';
import { replayedText } from '@/test/replay';

import { formatTenure } from './employee-format';

const employeesPath = `/clients/${clientId}/employees/${employeeId}`;
const page = `/clienti/${clientId}/angajati/${employeeId}`;

const worker = employeeRecord({
  lastName: 'Dumitrescu',
  firstName: 'Ioana',
  cnp: '2890714260037',
  employeeNumber: '0147',
  contractNumber: '214/03.03.2021',
  email: 'ioana.dumitrescu@example.com',
  phone: '0745 318 226',
  jobTitle: 'Operator la mașini de ambalat',
  jobPosition: { id: jobPositionId, name: 'Operator ambalare' },
  hiredAt: '2021-03-03',
  birthDate: '1989-07-14',
  birthPlace: 'Târnăveni',
  bloodGroup: 'A(II)',
  rhFactor: '+',
  homeAddress: 'Str. Mihai Viteazu nr. 18, Târnăveni',
  qualification: 'Operator calificat',
  education: 'Liceu',
  commuteRoute: 'Str. Mihai Viteazu – str. Gării',
  commuteMeans: ['on_foot', 'public_transport'],
  commuteMinutes: 25,
  notes: 'Lucrează în tura a II-a.',
});

const readySheet = { ready: true, missing: [], stored: false, sequences: [], versions: {} };
const missingFrom = (missing: MissingSheetData[]) => ({ ...readySheet, ready: false, missing });

function mockPage({
  employee = worker,
  archived = false,
  ssm = [],
  su = [],
}: {
  employee?: EmployeeResponseEmployee;
  archived?: boolean;
  ssm?: MissingSheetData[];
  su?: MissingSheetData[];
} = {}) {
  const client = clientRecord({ archivedAt: archived ? '2026-11-01T10:00:00.000Z' : null });
  mockApi((init, url) => {
    if ((init?.method ?? 'GET') !== 'GET') return undefined;
    switch (url.pathname) {
      case `/clients/${clientId}`:
        return Response.json({ client });
      case employeesPath:
        return Response.json({ employee });
      case `${employeesPath}/training-sheets`:
        return Response.json({
          ssm: ssm.length ? missingFrom(ssm) : readySheet,
          su: su.length ? missingFrom(su) : readySheet,
        });
      case `${employeesPath}/participant`:
        return Response.json({
          participant: null,
          invitation: null,
        } satisfies EmployeeParticipantState);
      case `${employeesPath}/signing-agreement/state`:
        return Response.json({
          agreement: null,
          unavailable: null,
        } satisfies SigningAgreementResponse);
      case `/clients/${clientId}/workplaces`:
        return Response.json({ items: [] });
      case `/clients/${clientId}/job-positions`:
        return Response.json({
          items: [jobPositionRecord({ id: jobPositionId, name: 'Operator ambalare' })],
        });
      default:
        return undefined;
    }
  });
}

installFetchMock();

const open = () => mountApp(authFixture(makeSession()).client, page);

const row = (label: string) =>
  screen.getByText(label, { selector: 'dt span' }).closest('dt')!.parentElement!;

describe("the Date tab of a worker's page", () => {
  it('lays the data out in five panels, without the portal and the agreement', async () => {
    mockPage();
    open();
    await screen.findByTestId('employee-page');
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      'Angajare',
      'Identitate',
      'Contact și adrese',
      'Pentru fișele de instruire',
      'Observații',
    ]);
    expect(screen.queryByTestId('employee-portal-card')).toBeNull();
    expect(screen.queryByText(/Act adițional/)).toBeNull();
    expect(
      [...screen.getByTestId('employee-employment').querySelectorAll('dt')].map(
        (term) => term.textContent
      )
    ).toEqual([
      'Post de lucru',
      'Funcția din contract',
      'Punct de lucru',
      'Data angajării',
      'Nr. contract',
      'Marca',
    ]);
  });

  it("opens the edit form at each panel's first field, named for the panel", async () => {
    mockPage();
    open();
    await screen.findByTestId('employee-page');
    const edits = [
      ['Modifică angajarea', 'employment'],
      ['Modifică identitatea', 'identity'],
      ['Modifică contactul și adresele', 'contact'],
      ['Modifică datele pentru fișe', 'sheet-data'],
      ['Modifică observațiile', 'notes'],
    ] as const;
    for (const [name, focus] of edits) {
      expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(
        `${page}/editare?focus=${focus}`
      );
    }

    await userEvent.setup().click(screen.getByRole('link', { name: 'Modifică identitatea' }));
    const lastName = await screen.findByTestId('employee-last-name');
    await waitFor(() => expect(document.activeElement).toBe(lastName));
  });

  it('links the post to its page and changes it from the same row', async () => {
    mockPage();
    open();
    await screen.findByTestId('employee-page');
    const post = screen.getByTestId('employee-job-position');
    expect(post.textContent).toBe('Operator ambalare');
    expect(post.getAttribute('href')).toBe(`/clienti/${clientId}/posturi/${jobPositionId}`);
    expect(post.querySelector('svg')?.parentElement?.textContent).toBe('ambalare');

    await userEvent
      .setup()
      .click(within(row('Post de lucru')).getByRole('button', { name: 'Schimbă postul de lucru' }));
    await screen.findByTestId('employee-job-position-dialog');
  });

  it('shows the tenure under the hire date', async () => {
    mockPage();
    open();
    await screen.findByTestId('employee-page');
    expect(within(row('Data angajării')).getByText(formatDate('2021-03-03'))).toBeTruthy();
    expect(within(row('Data angajării')).getByText(/^vechime:/).textContent).toBe(
      `vechime: ${formatTenure('2021-03-03', todayIso())}`
    );
    expect(screen.queryByText('Data încetării')).toBeNull();
  });

  it('gives a former worker the end date and the tenure at leaving, and keeps only the post link', async () => {
    mockPage({
      employee: { ...worker, status: 'terminated', terminatedAt: '2026-09-30' },
    });
    open();
    await screen.findByTestId('employee-page');
    const ended = row('Data încetării');
    expect(within(ended).getByText(formatDate('2026-09-30'))).toBeTruthy();
    expect(within(ended).getByText(/^vechime la plecare:/).textContent).toBe(
      'vechime la plecare: 5 ani și 6 luni'
    );
    expect(screen.queryByText(/^vechime:/)).toBeNull();
    expect(screen.getByTestId('employee-job-position').getAttribute('href')).toBe(
      `/clienti/${clientId}/posturi/${jobPositionId}`
    );
    expect(screen.queryByTestId('employee-job-position-change')).toBeNull();
    expect(screen.getByRole('link', { name: 'Modifică angajarea' })).toBeTruthy();
  });

  it('changes nothing at an archived client, and still says what a sheet lacks', async () => {
    mockPage({
      archived: true,
      employee: { ...worker, commuteRoute: null },
      ssm: ['employee.commute_route'],
    });
    open();
    await screen.findByTestId('employee-page');
    expect(screen.getByTestId('employee-job-position')).toBeTruthy();
    expect(screen.queryByTestId('employee-job-position-change')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Modifică/ })).toBeNull();
    expect(
      await within(row('Traseul de deplasare')).findByText('Lipsește pentru fișa SSM')
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Adaugă/ })).toBeNull();
  });

  it('marks in amber what the training sheets still need, with a way to the field', async () => {
    mockPage({
      employee: { ...worker, commuteRoute: null, workplace: null },
      ssm: ['employee.commute_route', 'employee.workplace'],
      su: ['employee.workplace'],
    });
    open();
    await screen.findByTestId('employee-page');
    const route = row('Traseul de deplasare');
    expect(await within(route).findByText('Lipsește pentru fișa SSM')).toBeTruthy();
    expect(within(route).getByText('Pe jos, Transport public')).toBeTruthy();
    expect(
      within(route).getByRole('link', { name: 'Adaugă traseul de deplasare' }).getAttribute('href')
    ).toBe(`${page}/editare?focus=commute-route`);
    const workplace = row('Punct de lucru');
    expect(within(workplace).getByText('Lipsește pentru fișele SSM și SU')).toBeTruthy();
    expect(
      within(workplace).getByRole('link', { name: 'Adaugă punctul de lucru' }).getAttribute('href')
    ).toBe(`${page}/editare?focus=workplace`);
  });

  it('shows a dash for an empty value the sheets do not need', async () => {
    mockPage({ employee: { ...worker, residenceAddress: null, authorizations: null } });
    open();
    await screen.findByTestId('employee-page');
    expect(row('Adresa unde locuiește').querySelector('dd')?.textContent).toBe('—');
    expect(row('Autorizații').querySelector('dd')?.textContent).toBe('—');
    expect(screen.queryByTestId('employee-missing')).toBeNull();
  });

  it('reveals the CNP with the eye after it and hides it again', async () => {
    mockPage();
    open();
    const user = userEvent.setup();
    const value = await screen.findByTestId('employee-cnp-value');
    expect(value.textContent).toBe('•••••••••0037');
    const eye = screen.getByRole('button', { name: 'Arată CNP-ul' });
    expect(eye.getAttribute('aria-pressed')).toBe('false');
    expect(eye.textContent).toBe('');

    await user.click(eye);
    expect(value.textContent).toBe('2890714260037');
    const hide = screen.getByRole('button', { name: 'Ascunde CNP-ul' });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    await user.click(hide);
    expect(value.textContent).toBe('•••••••••0037');
  });

  it('keeps every personal value out of a session replay', async () => {
    mockPage();
    open();
    await screen.findByTestId('employee-page');
    for (const text of [
      'Dumitrescu',
      'Ioana',
      formatDate('1989-07-14'),
      'Târnăveni',
      'A(II) Rh +',
      '0147',
      '214/03.03.2021',
      'ioana.dumitrescu@example.com',
      '0745 318 226',
      'Operator calificat',
      'Liceu',
      'Lucrează în tura a II-a.',
    ]) {
      expect(replayedText(screen.getByText(text)), text).not.toContain(text);
    }
    expect(replayedText(screen.getByText('Str. Mihai Viteazu nr. 18, Târnăveni'))).toBe(
      'Str. Xxxxx Xxxxxxx nr. 00, Xxxxxxxxx'
    );
    expect(replayedText(screen.getByTestId('employee-job-position'))).toBe('Operator ambalare');
  });
});
