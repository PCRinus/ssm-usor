import { describe, expect, it } from 'vitest';

import type { ImportDetail } from '@/api/generated/api';
import {
  fireCountProposal,
  importDetail,
  importFile,
  managementPostProposal,
  placesProposal,
  proposalFixture,
  readyDetail,
  secondPostProposal,
  substancesProposal,
  suggestedValuesProposal,
} from '@/test/import-fixture';

import {
  type Blocker,
  type Changes,
  type Proposal,
  type RegisteredCompany,
  type SectionId,
} from './review-model';
import {
  blockerHeading,
  blockerLinks,
  confirmLines,
  type ExistingScope,
  fieldStates,
  folderSentence,
  keptPaths,
  newClientScope,
  reviewName,
  sectionDescription,
  sectionReviewHints,
  sectionStatuses,
  smokingRule,
} from './review-summary';

const noChanges: Changes = { fields: {}, items: {} };

const changesOf = (fields: Changes['fields'] = {}, items: Changes['items'] = {}): Changes => ({
  fields,
  items,
});

const asDetail = (detail: ReturnType<typeof importDetail>) => detail as unknown as ImportDetail;

const statesOf = (
  proposal: Proposal,
  changes: Changes = noChanges,
  registered: RegisteredCompany | null = null
) => fieldStates(proposal, changes, () => undefined, registered);

function describeSection(
  section: SectionId,
  proposal: Proposal,
  changes: Changes = noChanges,
  { detail = readyDetail({ proposal }), scope = newClientScope } = {}
) {
  const registered = (detail.registeredCompany as RegisteredCompany | null) ?? null;
  return sectionDescription(
    section,
    asDetail(detail),
    proposal,
    changes,
    statesOf(proposal, changes, registered),
    scope
  );
}

const linesOf = (proposal: Proposal, changes: Changes = noChanges, scope = newClientScope) => {
  const { lines, left } = confirmLines(proposal, changes, statesOf(proposal, changes), scope);
  return {
    lines: lines.map((line) => `${line.count ?? ''}${line.label}`),
    left,
  };
};

const blockers = (code: Blocker['code'], count: number) =>
  Array.from({ length: count }, (_, index) => ({ path: `${code}.${index}`, code }));

describe('blockerHeading', () => {
  it('counts what is left with the "de" Romanian takes from 20 up', () => {
    expect(
      blockerHeading([
        ...blockers('choice', 25),
        ...blockers('missing', 2),
        ...blockers('invalid', 120),
      ])
    ).toEqual({
      heading: 'Mai ai 25 de alegeri, 2 date obligatorii și 120 de valori de corectat',
      resolve: 'Rezolvă cele 25 de alegeri, cele 2 date lipsă și cele 120 de valori greșite',
    });
  });

  it('says a single one of each in the singular, an unknown reference among what is missing', () => {
    expect(
      blockerHeading([
        ...blockers('choice', 1),
        ...blockers('unknown_reference', 1),
        ...blockers('invalid', 1),
      ])
    ).toEqual({
      heading: 'Mai ai o alegere, o dată obligatorie și o valoare de corectat',
      resolve: 'Rezolvă alegerea, data lipsă și valoarea greșită',
    });
    expect(blockerHeading(blockers('choice', 2)).heading).toBe('Mai ai 2 alegeri');
  });
});

describe("the posts another company's passages bring", () => {
  const describePositions = (proposal: ReturnType<typeof proposalFixture>) =>
    sectionDescription(
      'job-positions',
      importDetail() as unknown as ImportDetail,
      proposal,
      noChanges,
      {}
    );

  it('names a single one in the singular', () => {
    expect(describePositions(proposalFixture())).toContain(
      ' Un alt post apare doar în pasaje copiate de la altă firmă și rămâne deoparte.'
    );
  });

  it('names a fire-safety one, of whatever kind, as an element', () => {
    const proposal = proposalFixture();
    proposal.fireEquipment.push({
      ...proposal.fireEquipment[0]!,
      id: 'extinguisher-other',
      otherCompanyName: 'Lactate Câmpia SRL',
    });
    expect(
      sectionDescription(
        'fire-safety',
        importDetail() as unknown as ImportDetail,
        proposal,
        noChanges,
        {}
      )
    ).toContain(
      ' Un alt element apare doar în pasaje copiate de la altă firmă și rămâne deoparte.'
    );
  });

  it('counts several with the "de" Romanian takes from 20 up', () => {
    const proposal = proposalFixture();
    const other = proposal.jobPositions.find((position) => position.otherCompanyName !== null)!;
    proposal.jobPositions.push(
      ...Array.from({ length: 24 }, (_, index) => ({ ...other, id: `other-${index}` }))
    );
    expect(describePositions(proposal)).toContain(
      ' Alte 25 de posturi apar doar în pasaje copiate de la altă firmă și sunt lăsate deoparte.'
    );
  });
});

describe("a new client's name the documents give otherwise than ANAF", () => {
  const identity = (changes: Changes, documents: string, anafName: string) => {
    const proposal = proposalFixture();
    proposal.client.legalName.options[0]!.value = documents;
    proposal.client.contactEmail = { options: [] };
    const registered: RegisteredCompany = { cui: '31458207', legalName: anafName, inactive: false };
    const detail = readyDetail({ proposal, registeredCompany: { ...registered, vatPayer: true } });
    const states = fieldStates(proposal, changes, () => undefined, registered);
    return {
      summary: sectionDescription(
        'identity',
        detail as unknown as ImportDetail,
        proposal,
        changes,
        states
      ),
      status: sectionStatuses(proposal, changes, [], states, registered).identity,
    };
  };
  const documentsPicked: Changes = { fields: { 'client.legalName': { option: 0 } }, items: {} };
  const otherFirm = ['Brutăria Spicul Auriu SRL', 'PANIFICAȚIA NOUĂ SRL'] as const;

  it("still warns once the member picks the documents' name, which ANAF gives another firm", () => {
    expect(identity(documentsPicked, ...otherFirm)).toEqual({
      summary: 'La ANAF, CUI-ul aparține altei firme. Reprezentant legal: 2 variante în documente.',
      status: { kind: 'check' },
    });
  });

  it("says the CUI is checked once the member picks ANAF's name", () => {
    const anafPicked: Changes = {
      fields: { 'client.legalName': { value: 'PANIFICAȚIA NOUĂ SRL' } },
      items: {},
    };
    expect(identity(anafPicked, ...otherFirm).summary).toMatch(
      /^Denumire și CUI verificate la ANAF\./
    );
  });

  it("says the CUI is checked when the documents' name picked only writes the legal form otherwise", () => {
    expect(
      identity(documentsPicked, 'SPN STANCIUC', 'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC')
        .summary
    ).toMatch(/^Denumire și CUI verificate la ANAF\./);
  });
});

describe('the summary of each section on the hub', () => {
  it('sums up the identity by what ANAF says of the CUI, then the choices left', () => {
    expect(describeSection('identity', proposalFixture())).toBe(
      'Denumire și CUI verificate la ANAF. Reprezentant legal: 2 variante în documente.'
    );
    const unregistered = readyDetail({ registeredCompany: null });
    expect(
      describeSection('identity', proposalFixture(), noChanges, { detail: unregistered })
    ).toBe(
      'Denumire, CUI, adresă, reprezentant legal și persoană de contact. Reprezentant legal: 2 variante în documente.'
    );
    const inactive = readyDetail({
      registeredCompany: {
        cui: '31458207',
        legalName: 'BRUTĂRIA SPICUL AURIU SRL',
        vatPayer: false,
        inactive: true,
      },
    });
    expect(describeSection('identity', proposalFixture(), noChanges, { detail: inactive })).toMatch(
      /^Firmă inactivă la ANAF\./
    );
  });

  it('sums up the workplaces with their rooms', () => {
    expect(describeSection('workplaces', proposalFixture())).toBe(
      'un punct de lucru, cu 2 încăperi pentru mijloacele de apărare împotriva incendiilor.'
    );
  });

  it('sums up the people and the representative who becomes an employee', () => {
    expect(describeSection('responsible', proposalFixture())).toBe(
      'O persoană cu 2 roluri. Reprezentantul lucrătorilor devine lucrător și are nevoie de data angajării.'
    );
  });

  it('sums up both training schedules by the intervals in force', () => {
    expect(describeSection('training', proposalFixture())).toBe(
      'SSM la 6 luni pentru execuție și la 12 luni pentru tehnico-administrativ.'
    );
    const none = proposalFixture();
    none.trainingSchedule.workerTrainingIntervalMonths = { options: [] };
    none.trainingSchedule.administrativeTrainingIntervalMonths = { options: [] };
    expect(describeSection('training', none)).toBe('Programul instruirii periodice.');
  });

  it('tells apart a management-only post and the equipment left out with it', () => {
    const proposal = managementPostProposal();
    expect(describeSection('job-positions', proposal)).toBe(
      'un post. Postul „Administrator” se preia doar dacă e ocupat cu contract de muncă. Un alt post apare doar în pasaje copiate de la altă firmă și rămâne deoparte.'
    );
    expect(describeSection('equipment', proposal)).toBe(
      'Un articol pentru un post. Un articol rămâne deoparte cu postul lui.'
    );
  });

  it('leaves out a post the member left out, with its equipment', () => {
    const proposal = secondPostProposal();
    const changes = changesOf({}, { 'position-3': { included: false } });
    expect(describeSection('job-positions', proposal, changes)).toMatch(/^un post\./);
    expect(describeSection('equipment', proposal, changes)).toBe(
      'Un articol pentru un post. Un articol rămâne deoparte cu postul lui.'
    );
    expect(describeSection('equipment', proposal)).toBe('2 articole pentru 2 posturi.');
  });
});

describe('the smoking rule the fire-safety summary names', () => {
  const smoking = (proposal: Proposal, changes: Changes) =>
    smokingRule(statesOf(proposal, changes), changes);
  const disagreeing = () => {
    const proposal = proposalFixture();
    const option = (value: string, file: string) => ({
      value,
      sources: [{ file, quote: value }],
      otherCompanyName: null,
    });
    Object.assign(proposal.fireSafety, {
      smokingPolicy: {
        options: [option('forbidden_everywhere', 'a.pdf'), option('designated_places', 'b.pdf')],
      },
      smokingPlace: { options: [option('În curtea interioară', 'b.pdf')] },
    });
    return proposal;
  };
  const decided = (policy: number) =>
    changesOf({
      'fireSafety.smokingPolicy': { option: policy },
      'fireSafety.smokingPlace': { option: 0 },
    });

  it('is the policy chosen, with no place while smoking is forbidden everywhere', () => {
    expect(smoking(disagreeing(), decided(0))).toBe('Fumatul interzis peste tot');
    expect(describeSection('fire-safety', disagreeing(), decided(0))).toMatch(
      /^Fumatul interzis peste tot, 6 mijloace de stingere\./
    );
  });

  it('names the place once, without doubling its "în"', () => {
    expect(smoking(disagreeing(), decided(1))).toBe(
      'Fumat doar în locurile amenajate: în curtea interioară'
    );
  });

  it('is nothing while the policy waits for a choice', () => {
    expect(smoking(disagreeing(), noChanges)).toBeNull();
  });

  it('names no place until the member kept it, then the corrected value', () => {
    const proposal = placesProposal();
    expect(smoking(proposal, noChanges)).toBe('Fumat doar în locurile amenajate');
    expect(smoking(proposal, changesOf({ 'fireSafety.smokingPlace': { option: 0 } }))).toBe(
      'Fumat doar în locurile amenajate: La poarta unității'
    );
    expect(smoking(proposal, changesOf({ 'fireSafety.smokingPlace': { value: null } }))).toBe(
      'Fumat doar în locurile amenajate'
    );
  });
});

describe('a smoking place and an assembly point waiting to be confirmed', () => {
  const waiting: Blocker[] = [
    { path: 'fireSafety.smokingPlace', code: 'choice' },
    { path: 'assemblyPoints.workplace-1', code: 'choice' },
  ];

  it('are listed among what blocks confirming, each in its section', () => {
    const proposal = placesProposal();
    expect(
      blockerLinks(proposal, noChanges, waiting).map(({ text, section, anchor }) => [
        text,
        section,
        anchor,
      ])
    ).toEqual([
      ['Confirmă locul pentru fumat', 'fire-safety', 'review-fireSafety-smokingPlace'],
      ['Confirmă punctul de adunare: Sediu', 'workplaces', 'review-assemblyPoints-workplace-1'],
    ]);
    const statuses = sectionStatuses(proposal, noChanges, waiting, statesOf(proposal), null);
    expect(statuses.workplaces).toEqual({ kind: 'choice' });
    expect(statuses['fire-safety']).toEqual({ kind: 'choice' });
    expect(describeSection('fire-safety', proposal)).toMatch(
      /^Fumat doar în locurile amenajate, 6 mijloace de stingere\./
    );
  });
});

describe('means two files count differently', () => {
  const countPath = 'fireEquipmentCounts.count-1';

  it('sum up the section by the choice that waits, counting none of their means', () => {
    const proposal = fireCountProposal();
    const statuses = sectionStatuses(
      proposal,
      noChanges,
      [{ path: countPath, code: 'choice' }],
      statesOf(proposal),
      null
    );
    expect(statuses['fire-safety']).toEqual({ kind: 'choice' });
    const description = describeSection('fire-safety', proposal);
    expect(description).toContain('un mijloc de stingere.');
    expect(description).toContain(' Stingător P6: 2 numere în documente.');
  });

  it('count only the chosen file’s units in what confirming creates', () => {
    const chosen = changesOf({ [countPath]: { option: 1 } });
    expect(linesOf(fireCountProposal(), chosen).lines).toContain('5mijloace de apărare');
    expect(describeSection('fire-safety', fireCountProposal(), chosen)).not.toContain(
      'numere în documente'
    );
  });
});

describe('the dangerous substances', () => {
  const statePath = 'fireSafety.substancesState';

  it('are counted in the summary and among what confirming creates', () => {
    const proposal = substancesProposal();
    const oneLeftOut = changesOf({}, { 'substance-1': { included: false } });
    expect(describeSection('fire-safety', proposal, oneLeftOut)).toContain(
      ', o substanță periculoasă.'
    );
    expect(linesOf(proposal, oneLeftOut).lines).toContain('1substanță periculoasă');
    expect(describeSection('fire-safety', proposal)).toContain(', 2 substanțe periculoase.');
  });

  it('are counted only where an existing client does not list them already', () => {
    const scope: ExistingScope = {
      ...newClientScope,
      existingClient: true,
      existingSubstances: ['DETERGENTI'],
    };
    expect(describeSection('fire-safety', substancesProposal(), noChanges, { scope })).toContain(
      ', o substanță periculoasă.'
    );
  });

  it('are none where the documents say none are used, which a new client declares', () => {
    const proposal = substancesProposal(['none']);
    expect(describeSection('fire-safety', proposal)).toContain(', fără substanțe periculoase.');
    expect(linesOf(proposal).lines).toContain('Nu se utilizează substanțe periculoase');
  });

  it('are none while the member leaves the answer undecided', () => {
    const proposal = substancesProposal();
    const undecided = changesOf({ [statePath]: { value: null } });
    expect(describeSection('fire-safety', proposal, undecided)).not.toContain('substanț');
    expect(linesOf(proposal, undecided).lines.join()).not.toContain('substanț');
  });
});

describe('a registered office with no activity beside a workshop', () => {
  const office = 'officeActivity.workplace-1';
  const card = 'suggestedValues.workplace-2';
  const withWorkshopMeans = () => {
    const proposal = suggestedValuesProposal();
    proposal.fireEquipment.push({
      ...proposal.fireEquipment[0]!,
      id: 'extinguisher-2',
      workplace: { name: 'Atelier', id: 'workplace-2' },
      room: 'Atelier',
      count: 2,
    });
    return proposal;
  };

  it('lists the office and the workshop among what blocks confirming', () => {
    expect(
      blockerLinks(suggestedValuesProposal(), noChanges, [
        { path: office, code: 'choice' },
        { path: card, code: 'choice' },
      ]).map((link) => link.text)
    ).toEqual([
      'Alege dacă la sediul social se desfășoară activitate',
      'Confirmă sugestiile din activitate: Atelier',
    ]);
  });

  it('leaves the means at the office out of the summary and of what confirming creates', () => {
    const decided = changesOf({ [office]: { option: 0 }, [card]: { option: 0 } });
    expect(describeSection('fire-safety', withWorkshopMeans(), decided)).toContain(
      '2 mijloace de stingere.'
    );
    expect(linesOf(withWorkshopMeans(), decided).lines).toContain('2mijloace de apărare');
    expect(linesOf(withWorkshopMeans(), changesOf({ [card]: { option: 0 } })).lines).toContain(
      '8mijloace de apărare'
    );
  });

  it('lists the suggested values kept and the office with no activity among what confirming creates', () => {
    const decided = changesOf(
      { [office]: { option: 0 }, [card]: { option: 0 } },
      { 'workplace-2': { values: { ignitionSources: null } } }
    );
    const { lines } = linesOf(suggestedValuesProposal(), decided);
    expect(lines).toContain('Fără activitate la sediul social');
    expect(lines).toContain('2valori sugerate din activitate');
    expect(lines.join()).not.toContain('mijloace de apărare');
    expect(lines.join()).not.toContain('mijloc de apărare');
  });

  it('counts no suggested value before the member confirms them', () => {
    const { lines } = linesOf(suggestedValuesProposal(), changesOf({ [office]: { option: 0 } }));
    expect(lines.join()).not.toContain('valori sugerate');
  });
});

describe('what confirming creates', () => {
  it('lists each kind the import takes, and counts what another company’s passages bring', () => {
    expect(linesOf(proposalFixture())).toEqual({
      lines: [
        '1punct de lucru',
        '1post de lucru',
        '1responsabil',
        '1lucrător',
        '6mijloace de apărare',
      ],
      left: 1,
    });
  });

  it('leaves out a management-only post, and counts it apart from another company’s', () => {
    expect(linesOf(managementPostProposal())).toMatchObject({
      lines: expect.arrayContaining(['1post de lucru']) as string[],
      left: 1,
    });
  });

  it('leaves out a post the member left out', () => {
    const changes = changesOf({}, { 'position-3': { included: false } });
    expect(linesOf(secondPostProposal(), changes)).toMatchObject({
      lines: expect.arrayContaining(['1post de lucru']) as string[],
      left: 1,
    });
    expect(linesOf(secondPostProposal()).lines).toContain('2posturi de lucru');
  });
});

describe('what a section asks the member to look at', () => {
  it('names each item proposed unticked, once, by why', () => {
    const proposal = managementPostProposal();
    proposal.employees.push({
      ...proposal.employees[0]!,
      id: 'employee-2',
      role: 'legal_representative',
      lastName: 'Popescu',
      firstName: 'Ioana',
    });
    expect(sectionReviewHints('job-positions', proposal, noChanges)).toEqual([
      {
        anchor: 'review-jobPositions-position-2',
        summary: 'Date din pasaje despre altă firmă',
        text: 'Stivuitorist: apare în pasaje despre altă firmă. Verifică dacă îl preiei.',
      },
      {
        anchor: 'review-jobPositions-position-3',
        summary: 'Post de conducere nepreluat automat',
        text: 'Administrator: se preia doar dacă este ocupat cu contract de muncă.',
      },
    ]);
    expect(
      sectionReviewHints('equipment', proposal, noChanges).map((hint) => hint.summary)
    ).toEqual(['Articol cu postul lăsat deoparte']);
    expect(sectionReviewHints('responsible', proposal, noChanges)).toEqual([
      {
        anchor: 'review-employees-employee-2',
        summary: 'Reprezentant legal nepreluat automat',
        text: 'Popescu Ioana: nu este preluat automat ca lucrător. Verifică dacă face parte din personalul firmei.',
      },
    ]);
  });
});

describe('the name the review goes by', () => {
  const anafName = 'PANIFICAȚIA NOUĂ SRL';
  const anafDetail = (changes: Changes | null = null) =>
    readyDetail({
      changes,
      registeredCompany: { cui: '31458207', legalName: anafName, vatPayer: true, inactive: false },
    });
  const nameOf = (detail: ReturnType<typeof readyDetail>, changes: Changes = noChanges) =>
    reviewName(asDetail(detail), detail.proposal as unknown as Proposal, changes);

  it("is ANAF's for a new client until the documents' is picked", () => {
    const detail = anafDetail();
    expect(nameOf(detail)).toBe(anafName);
    expect(describeSection('identity', proposalFixture(), noChanges, { detail })).toMatch(
      /^Documentele dau altă denumire decât ANAF\. Am ales-o pe cea de la ANAF\./
    );
    const documents = changesOf({ 'client.legalName': { option: 0 } });
    expect(nameOf(detail, documents)).toBe('Brutăria Spicul Auriu SRL');
  });

  it('warns on the hub when the member writes another firm’s name than ANAF’s', () => {
    const written = changesOf({ 'client.legalName': { value: 'Alfa SRL' } });
    expect(
      describeSection('identity', proposalFixture(), written, { detail: anafDetail() })
    ).toMatch(/^La ANAF, CUI-ul aparține altei firme\./);
  });

  it('is the client’s own once the import completes an existing client', () => {
    const detail = readyDetail({
      intoExistingClient: true,
      client: { id: 'client-1', legalName: 'Spicul Auriu SA' },
    });
    expect(nameOf(detail)).toBe('Spicul Auriu SA');
  });

  it('is the company the upload named while the documents leave the name to pick', () => {
    const detail = readyDetail({ registeredCompany: null });
    const proposal = detail.proposal as unknown as Proposal;
    proposal.client.legalName.options = [];
    expect(nameOf(detail)).toBe('Brutăria Spicul Auriu SRL');
    detail.companyName = 'Alt nume SRL';
    expect(nameOf(detail)).toBe('Alt nume SRL');
  });
});

describe('the files kept with the client', () => {
  it('counts only the client’s own files a browser can show', () => {
    const detail = readyDetail({
      files: [
        importFile(),
        importFile({ state: 'other_company' }),
        importFile({ mimeType: 'image/heic', hasDerived: false }),
        importFile({ mimeType: 'image/heic', hasDerived: true }),
      ],
    });
    expect(folderSentence(asDetail(detail))).toBe(
      'Cele 2 fișiere rămân la client, în Alte documente, grupate ca dosarul importat.'
    );
    expect(folderSentence(asDetail(readyDetail({ files: [importFile()] })))).toBe(
      'Fișierul rămâne la client, în Alte documente, ca dosarul importat.'
    );
  });
});

describe('the values an existing client keeps', () => {
  it('are those the documents give otherwise', () => {
    const states = fieldStates(proposalFixture(), noChanges, (path) =>
      path === 'client.contactPhone' ? '0269 214 300' : path === 'client.locality' ? 'Sibiu' : null
    );
    expect(keptPaths(states)).toEqual(['client.contactPhone']);
  });
});
