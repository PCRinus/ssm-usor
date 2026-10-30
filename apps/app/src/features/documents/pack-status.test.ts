import { describe, expect, it } from 'vitest';

import type { ClientDocument } from './document-labels';
import { buildPack, documentStatus, type Pack, type PackRow } from './pack-status';

const revision = (overrides: Record<string, unknown> = {}) => ({
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  revision: 1,
  status: 'draft',
  issueDate: '2026-01-19',
  dataChanged: false,
  editedAt: null,
  issuedAt: null,
  hasPdf: false,
  hasSignedCopy: false,
  receivedCopy: null,
  templateVersion: null,
  annexes: [],
  createdAt: '2026-09-19T10:00:00+00:00',
  ...overrides,
});

let nextId = 0;

function clientDocument(
  typeKey: string,
  state: { draft?: boolean; issued?: boolean; dataChanged?: boolean; period?: number } = {
    draft: true,
  },
  title = `Document ${typeKey}`
) {
  nextId += 1;
  return {
    id: `document-${nextId}`,
    clientId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    typeKey,
    title,
    decisionNumber: null,
    period: state.period ?? null,
    draft: state.draft ? revision({ dataChanged: state.dataChanged ?? false }) : null,
    issued: state.issued ? revision({ status: 'issued', revision: 2 }) : null,
  } as unknown as ClientDocument;
}

const notBehind = () => false;

const titlesOf = (pack: Pack, sectionId: string) =>
  pack.sections.find((section) => section.id === sectionId)?.rows.map((row) => row.title);

const rowOf = (pack: Pack, key: string) =>
  pack.sections.flatMap((section) => section.rows).find((row) => row.key === key) as PackRow;

describe('document status', () => {
  it.each([
    ['changed data', { draft: true, dataChanged: true }, false, 'update'],
    [
      'changed data over an issued revision',
      { draft: true, dataChanged: true, issued: true },
      false,
      'update',
    ],
    ['an issued revision with a newer template', { issued: true }, true, 'update'],
    ['a draft with newer instructions', { draft: true }, true, 'update'],
    ['a draft over an issued revision', { draft: true, issued: true }, false, 'draft'],
    ['a draft only', { draft: true }, false, 'draft'],
    ['an issued revision only', { issued: true }, false, 'issued'],
  ] as const)('is the most pressing state for %s', (_, state, behind, status) => {
    expect(documentStatus(clientDocument('control_report', state), behind)).toBe(status);
  });
});

describe('build pack', () => {
  it('lists every occupational safety document, a missing one by its template title', () => {
    const pack = buildPack({
      set: 'occupational_safety',
      items: [
        clientDocument('decision_training', { draft: true }, 'Decizia nr. 2 privind instruirea'),
      ],
      notApplicable: [],
      isBehind: notBehind,
    });
    expect(pack.sections.map((section) => section.number)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
    ]);
    expect(pack.sections[0]).toMatchObject({ id: 'decisions', title: 'Decizii interne' });
    expect(titlesOf(pack, 'decisions')).toEqual([
      'Copertă – Deciziile interne',
      'Decizia nr. 2 privind instruirea',
      'Decizia privind echipa de evaluare a riscurilor',
      'Decizia privind responsabilii cu primul ajutor',
      'Decizia privind pericolul grav și iminent',
      'Decizia privind reprezentanții lucrătorilor',
    ]);
    expect(rowOf(pack, 'cover_decisions')).toEqual({
      kind: 'missing',
      key: 'cover_decisions',
      title: 'Copertă – Deciziile interne',
      document: null,
      status: 'missing',
    });
    expect(titlesOf(pack, 'signing-regulation-annex')).toEqual([
      'Anexă la Regulamentul intern privind semnarea electronică a fișelor de instruire',
    ]);
    expect(pack.counts).toEqual({ update: 0, draft: 1, issued: 0, missing: 23 });
  });

  it('lists every fire-safety document, a missing one by its template title', () => {
    const pack = buildPack({
      set: 'fire_safety',
      items: [clientDocument('fire_work_permit', { issued: true }, 'Permis de lucru cu foc')],
      notApplicable: [],
      isBehind: notBehind,
    });
    expect(pack.sections.map((section) => [section.number, section.id])).toEqual([
      ['1', 'decisions'],
      ['2', 'own-instructions'],
      ['3', 'training-themes'],
      ['4', 'tests'],
      ['5', 'means'],
      ['6', 'registers'],
      ['7', 'inspectorate'],
    ]);
    expect(titlesOf(pack, 'registers')).toEqual([
      'Copertă – Registrele de evidență în domeniul situațiilor de urgență',
      'Evidența exercițiilor de intervenție, a controalelor și a permiselor de lucru cu foc',
      'Permis de lucru cu foc',
      'Registru de control pentru instalațiile de apărare împotriva incendiilor',
      'Registru de evidență a controlului stingătoarelor de incendiu',
    ]);
    expect(rowOf(pack, 'fire_work_permit')).toMatchObject({ kind: 'document', status: 'issued' });
    expect(pack.counts).toEqual({ update: 0, draft: 0, issued: 1, missing: 27 });
  });

  it('counts a document behind its template as one to update', () => {
    const behind = clientDocument('control_report', { issued: true });
    const pack = buildPack({
      set: 'occupational_safety',
      items: [behind, clientDocument('risk_assessment', { issued: true })],
      notApplicable: [],
      isBehind: (document) => document.id === behind.id,
    });
    expect(rowOf(pack, 'control_report').status).toBe('update');
    expect(rowOf(pack, 'risk_assessment').status).toBe('issued');
  });

  it('hides decision 1.5 when it does not apply and does not exist', () => {
    const pack = buildPack({
      set: 'occupational_safety',
      items: [],
      notApplicable: ['decision_workers_representative'],
      isBehind: notBehind,
    });
    expect(pack.sections[0]?.rows.map((row) => row.key)).toEqual([
      'cover_decisions',
      'decision_training',
      'decision_risk_evaluation_team',
      'decision_first_aid',
      'decision_imminent_danger',
    ]);
    expect(pack.counts.missing).toBe(23);
  });

  it('leaves out a section none of whose documents apply or exist', () => {
    const pack = buildPack({
      set: 'fire_safety',
      items: [],
      notApplicable: ['fire_site_sheet', 'fire_annual_report'],
      isBehind: notBehind,
    });
    expect(pack.sections.map((section) => section.id)).not.toContain('inspectorate');
    expect(pack.sections).toHaveLength(6);
  });

  it('lists a document that exists although its type no longer applies', () => {
    const pack = buildPack({
      set: 'occupational_safety',
      items: [
        clientDocument(
          'decision_workers_representative',
          { issued: true },
          'Decizia privind reprezentanții lucrătorilor'
        ),
      ],
      notApplicable: ['decision_workers_representative'],
      isBehind: notBehind,
    });
    expect(rowOf(pack, 'decision_workers_representative')).toMatchObject({
      kind: 'document',
      status: 'issued',
    });
    expect(pack.sections[0]?.counts).toEqual({ update: 0, draft: 0, issued: 1, missing: 5 });
  });

  it('puts the documents of types the set does not list in a last, unnumbered section', () => {
    const pack = buildPack({
      set: 'fire_safety',
      items: [clientDocument('fire_evacuation_plan', { draft: true }, 'Plan de evacuare')],
      notApplicable: [],
      isBehind: notBehind,
    });
    expect(pack.sections.at(-1)).toMatchObject({
      id: 'other',
      number: null,
      title: 'Alte documente PSI',
      rows: [{ kind: 'document', key: 'fire_evacuation_plan', title: 'Plan de evacuare' }],
      counts: { update: 0, draft: 1, issued: 0, missing: 0 },
    });
  });

  it('has no other section when every document is of a listed type', () => {
    const pack = buildPack({
      set: 'occupational_safety',
      items: [clientDocument('control_report')],
      notApplicable: [],
      isBehind: notBehind,
    });
    expect(pack.sections.map((section) => section.id)).not.toContain('other');
  });

  it('counts only the newest year of a dated type and folds the earlier ones under it', () => {
    const newest = clientDocument(
      'fire_annual_report',
      { draft: true, period: 2026 },
      'Raportul anual de evaluare a capacității de apărare împotriva incendiilor'
    );
    const earlier = clientDocument(
      'fire_annual_report',
      { issued: true, period: 2025 },
      'Raportul anual de evaluare a capacității de apărare împotriva incendiilor'
    );
    const pack = buildPack({
      set: 'fire_safety',
      items: [newest, earlier],
      notApplicable: [],
      isBehind: notBehind,
    });
    expect(rowOf(pack, 'fire_annual_report')).toMatchObject({
      kind: 'document',
      title: 'Raport anual de evaluare 2026',
      document: newest,
      earlier: [earlier],
      status: 'draft',
    });
    expect(pack.sections.find((section) => section.id === 'inspectorate')?.counts).toEqual({
      update: 0,
      draft: 1,
      issued: 0,
      missing: 1,
    });
  });

  it('counts the pack as the sum of its sections', () => {
    const pack = buildPack({
      set: 'fire_safety',
      items: [
        clientDocument('fire_decision_training', { draft: true, dataChanged: true }),
        clientDocument('fire_means_list', { draft: true, issued: true }),
        clientDocument('fire_test_hiring', { issued: true }),
        clientDocument('fire_evacuation_plan', { issued: true }),
      ],
      notApplicable: ['fire_decision_seasons'],
      isBehind: notBehind,
    });
    const sum = { update: 0, draft: 0, issued: 0, missing: 0 };
    for (const section of pack.sections) {
      for (const status of ['update', 'draft', 'issued', 'missing'] as const) {
        sum[status] += section.counts[status];
      }
    }
    expect(pack.counts).toEqual(sum);
    expect(pack.counts).toEqual({ update: 1, draft: 1, issued: 2, missing: 24 });
  });
});
