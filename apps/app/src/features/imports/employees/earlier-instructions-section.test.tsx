import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportDetail } from '@/api/generated/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import {
  clientId,
  employeeDetail,
  employeeProposal,
  importId,
  positions,
  sheetRow,
  workplaces,
} from '@/test/employee-import-fixture';
import { fetchMock, mockApi, requestsTo } from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { sheetTrainingCounts } from './earlier-instructions-counts';
import { emptyChanges, peopleViews, type ReviewContext } from './employee-review-model';

const client = {
  id: clientId,
  legalName: 'Brutăria Spicul Auriu SRL',
  cui: '31458207',
  vatPayer: true,
  caenCode: '1071',
  tradeRegisterNumber: null,
  countyCode: 'SB',
  locality: 'Sibiu',
  addressLine: null,
  legalRepresentativeName: null,
  declaredEmployeeCount: 0,
  currentEmployeeCount: 0,
  stage: 'client',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  promotedAt: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const earlierPath = `/clients/${clientId}/earlier-instructions`;
const importPath = `/clienti/${clientId}/angajati/import/${importId}`;

const link = {
  url: 'http://127.0.0.1:54321/storage/v1/object/sign/client-files/x.pdf?token=t',
  fileName: 'IPSSM 2019.pdf',
  disposition: 'inline',
  expiresInSeconds: 600,
};

const keptFile = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  note: null,
  ownersOnly: false,
  employee: null,
  originalFileName: `${name}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 1_887_436,
  sha256: 'a'.repeat(64),
  uploadedBy: { id: 'user-one', fullName: 'Radu Pop' },
  canChange: true,
  importId: null,
  importPath: null,
  importKind: null,
  importRead: null,
  importReason: null,
  earlierInstructions: { domain: 'ssm', validUntil: '2026-11-12' },
  createdAt: '2026-11-12T10:00:00+00:00',
  updatedAt: '2026-11-12T10:00:00+00:00',
  link,
  ...extra,
});

const domain = (name: 'ssm' | 'su', overrides: Record<string, unknown> = {}) => ({
  domain: name,
  paperTrainingCount: 0,
  state: 'missing',
  imported: null,
  files: [],
  unavailable: null,
  ...overrides,
});

// The fixture's sheets hold occupational safety rows only; one fire-safety row makes both asked.
function detailWithSu(): ImportDetail {
  const base = employeeDetail();
  const proposal = employeeProposal();
  proposal.pages[2] = {
    ...proposal.pages[2]!,
    rows: [
      ...proposal.pages[2]!.rows,
      sheetRow('r-su', { domain: 'su', material: 'IPSU, art. 1–96' }),
    ],
  };
  return { ...base, employees: { ...base.employees!, proposal } } as unknown as ImportDetail;
}

function mockHub(
  domains: () => unknown[],
  extra: (init: RequestInit | undefined, url: URL) => Response | undefined = () => undefined,
  detail: ImportDetail = detailWithSu()
) {
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
    const custom = extra(init, url);
    if (custom) return custom;
    if (url.pathname === `/imports/${importId}`) return Response.json({ import: detail });
    if (url.pathname === '/imports') return Response.json({ items: [] });
    if (url.pathname === `/clients/${clientId}`) return Response.json({ client, canDelete: false });
    if (url.pathname === `/clients/${clientId}/job-positions`) {
      return Response.json({ items: positions });
    }
    if (url.pathname === `/clients/${clientId}/workplaces`) {
      return Response.json({ items: workplaces });
    }
    if (url.pathname === `/clients/${clientId}/found-sheets`) {
      return Response.json({ items: [], total: 0 });
    }
    if (url.pathname === `/clients/${clientId}/employees`) {
      return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
    }
    if (url.pathname === earlierPath && method === 'GET') {
      return Response.json({ domains: domains() });
    }
    return undefined;
  });
}

const uploads: URL[] = [];
let answerUpload: () => unknown = () => ({});

class FakeXhr {
  upload = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 0;
  responseText = '';
  responseURL = '';
  private url = '';
  open(_method: string, url: URL | string) {
    this.url = String(url);
  }
  setRequestHeader() {}
  getResponseHeader() {
    return null;
  }
  abort() {}
  send() {
    uploads.push(new URL(this.url));
    setTimeout(() => {
      this.status = 201;
      this.responseText = JSON.stringify(answerUpload());
      this.responseURL = this.url;
      this.onload?.();
    }, 0);
  }
}

const mount = () => mountApp(authFixture(makeSession()).client, importPath);

const rowOf = async (name: 'ssm' | 'su') => {
  const card = await screen.findByTestId('employee-hub-earlier-instructions');
  return within(card)
    .getAllByTestId('earlier-instructions-domain')
    .find((row) => row.dataset.domain === name)!;
};

beforeEach(() => {
  fetchMock.mockReset();
  uploads.length = 0;
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the earlier own instructions in the employee import', () => {
  it('counts the training rows of the people the import creates, per domain', () => {
    const detail = detailWithSu();
    const context = {
      proposal: detail.employees!.proposal,
      changes: emptyChanges(),
      states: {},
      workplaceCount: 2,
      today: '2026-11-14',
    } as unknown as ReviewContext;
    const views = peopleViews(context);
    expect(sheetTrainingCounts(context, views)).toEqual({ ssm: 6, su: 1 });
    const aside = views.map((view) => ({ ...view, included: view.person.id !== 'pop' }));
    expect(sheetTrainingCounts(context, aside)).toEqual({ ssm: 5, su: 0 });
  });

  it('asks last, per domain, with how many rows cite each, and says it is no legal duty', async () => {
    mockHub(() => [domain('ssm'), domain('su')]);
    mount();
    const card = await screen.findByTestId('employee-hub-earlier-instructions');
    const sections = [...document.querySelectorAll('section[aria-labelledby]')];
    expect(sections.at(-1)!.getAttribute('aria-labelledby')).toBe(
      'employee-hub-earlier-instructions-heading'
    );
    expect(within(card).getByTestId('section-status').textContent).toBe('Opțional');
    expect(card.textContent).toContain('Nu e o obligație legală și nu oprește importul.');
    expect(card.textContent).not.toMatch(/HG|OMAI|Legea/);
    expect((await rowOf('ssm')).textContent).toContain('la ele trimit 6 instruiri');
    expect((await rowOf('su')).textContent).toContain('la ele trimit o instruire');
  });

  it('leaves out a domain the sheets have no trainings in', async () => {
    mockHub(() => [domain('ssm'), domain('su')], undefined, employeeDetail());
    mount();
    await screen.findByTestId('employee-hub-earlier-instructions');
    const rows = screen.getAllByTestId('earlier-instructions-domain');
    expect(rows.map((row) => row.dataset.domain)).toEqual(['ssm']);
  });

  it('answers Nu le am for one domain alone, and lets the answer be changed', async () => {
    let su = 'missing';
    mockHub(
      () => [domain('ssm'), domain('su', { state: su })],
      (init, url) => {
        if (url.pathname !== `${earlierPath}/su/unavailable`) return undefined;
        su = init?.method === 'PUT' ? 'unavailable' : 'missing';
        return new Response(null, { status: 204 });
      }
    );
    mount();
    const user = userEvent.setup();
    const row = await rowOf('su');
    const [, desktop] = within(row).getAllByTestId('earlier-instructions-none');
    await user.click(desktop!);
    await waitFor(async () => expect((await rowOf('su')).dataset.state).toBe('unavailable'));
    expect(requestsTo(`${earlierPath}/su/unavailable`, 'PUT')).toHaveLength(1);
    expect(requestsTo(`${earlierPath}/ssm/unavailable`, 'PUT')).toHaveLength(0);
    expect((await rowOf('ssm')).dataset.state).toBe('missing');
    const answered = await rowOf('su');
    expect(answered.textContent).toContain('Ai răspuns că nu le ai.');
    await user.click(within(answered).getByTestId('earlier-instructions-change'));
    await waitFor(async () => expect((await rowOf('su')).dataset.state).toBe('missing'));
    expect(requestsTo(`${earlierPath}/su/unavailable`, 'DELETE')).toHaveLength(1);
  });

  it('uploads a picked file with its domain and day, and shows it with Scoate', async () => {
    let files: unknown[] = [];
    answerUpload = () => {
      files = [keptFile('f1000000-0000-4000-8000-000000000001', 'IPSSM 2019')];
      return { file: files[0] };
    };
    mockHub(() => [domain('ssm', files.length ? { state: 'added', files } : {}), domain('su')]);
    mount();
    const user = userEvent.setup();
    const row = await rowOf('ssm');
    await user.upload(
      within(row).getByTestId('earlier-instructions-input'),
      new File(['%PDF-1.4'], 'IPSSM 2019.pdf', { type: 'application/pdf' })
    );
    await waitFor(async () => expect((await rowOf('ssm')).dataset.state).toBe('added'));
    const [sent] = uploads as [URL];
    expect(sent.searchParams.get('earlierInstructionsDomain')).toBe('ssm');
    expect(sent.searchParams.get('validUntil')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const added = await rowOf('ssm');
    expect(within(added).getByTestId('earlier-instructions-file').textContent).toContain(
      'IPSSM 2019.pdf'
    );
    expect(within(added).getByTestId('earlier-instructions-remove').textContent).toBe('Scoate');
    expect(within(added).getByTestId('earlier-instructions-add-more')).toBeTruthy();
  });

  it('shows a domain a client import kept as answered, with its files and no controls', async () => {
    mockHub(() => [
      domain('ssm', {
        state: 'imported',
        imported: {
          confirmedOn: '2026-10-12',
          files: [
            keptFile('f1000000-0000-4000-8000-000000000002', 'IPSSM fierar', {
              earlierInstructions: null,
            }),
          ],
        },
      }),
      domain('su', { state: 'imported', imported: { confirmedOn: '2026-10-12', files: [] } }),
    ]);
    mount();
    const card = await screen.findByTestId('employee-hub-earlier-instructions');
    await waitFor(async () => expect((await rowOf('ssm')).dataset.state).toBe('imported'));
    const row = await rowOf('ssm');
    expect(row.textContent).toContain('Le avem din documentația importată pe 12 octombrie 2026');
    expect(
      within(row).getByTestId('earlier-instructions-file-link').getAttribute('href')
    ).toContain('/files/download?');
    expect(within(row).queryByRole('button')).toBeNull();
    expect(within(card).getByTestId('section-status').textContent).toBe('Le avem');
  });
});
