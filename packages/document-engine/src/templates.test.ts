import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { annexTitlePage } from './annex-title';
import { renderDocument, templatePlaceholders } from './render';
import { documentText } from './text';

const templatesUrl = new URL('../templates/', import.meta.url);
// Built into the engine rather than kept in `templates/`, and typeset like the rest.
const annexTitle = 'annex title page';
const read = (name: string) =>
  name === annexTitle
    ? annexTitlePage()
    : new Uint8Array(readFileSync(new URL(name, templatesUrl)));
const documentTextOf = (paragraph: string) =>
  [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('');

const allTemplateFiles = readdirSync(fileURLToPath(templatesUrl)).filter((name) =>
  name.endsWith('.docx')
);
const fireFiles = readdirSync(fileURLToPath(new URL('fire/', templatesUrl)))
  .filter((name) => name.endsWith('.docx'))
  .map((name) => `fire/${name}`);

// What the provider's originals printed. None of it may survive in a template. A date counts
// from 2020 on: the laws the documents quote are dated too, and older.
const originals =
  /VELOCITA|PIPETECH|PROFLEX|SAFETY CORE|POPA|LUCA|CASAPU|TALO[SȘ]|GIURGEA|D-na|D-l |\b\d{2}\.\d{2}\.202\d\b/;

// What only the decisions have: a signature block, an acknowledgement table, its wording.
const decisionFiles = allTemplateFiles.filter((name) => name.includes('_decision_'));
const templateFiles = allTemplateFiles;
const typesetFiles = [...templateFiles, ...fireFiles, annexTitle];

describe('built-in templates', () => {
  it.each(typesetFiles)('%s carries nothing of the client it was made from', (name) => {
    expect(documentText(read(name))).not.toMatch(originals);
  });
});

// Written by us and not imported (ADR 007), so they are kept apart from the provider's pack.
describe('templates outside the pack', () => {
  const otherUrl = new URL('other/', templatesUrl);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', otherUrl), 'utf8')) as {
    templates: { typeKey: string; title: string; file: string }[];
  };
  const files = readdirSync(fileURLToPath(otherUrl)).filter((name) => name.endsWith('.docx'));

  it('are the files of their manifest, named after their types', () => {
    expect(manifest.templates.map((entry) => entry.file).sort()).toEqual([...files].sort());
    for (const entry of manifest.templates) expect(entry.file).toBe(`${entry.typeKey}.docx`);
  });

  it.each(files)('%s carries nothing of the contract it was modelled on', (name) => {
    const text = documentText(new Uint8Array(readFileSync(new URL(name, otherUrl))));
    expect(text).not.toMatch(originals);
    expect(text).not.toMatch(/\b\d+([.,]\d+)? ?(RON|lei)\b/i);
  });

  it('numbers the articles of the contract with a list, and nothing else', () => {
    const zip = new PizZip(readFileSync(new URL('service_contract.docx', otherUrl)));
    expect(zip.file('word/numbering.xml')!.asText()).toContain('w:lvlText w:val="Art. %1."');
    const numbered = (
      zip
        .file('word/document.xml')!
        .asText()
        .match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []
    )
      .filter((paragraph) => /<w:numId w:val="[1-9]/.test(paragraph))
      .map(documentTextOf);
    expect(numbered.length).toBeGreaterThan(25);
    for (const text of numbered) {
      expect(text).not.toMatch(/^\{\{[#/]/);
      expect(text).not.toMatch(/^[a-z]\) /);
    }
  });
});

// ADR 016: a set of its own, in its own folder, merged with the shared facts, the technician
// and, from stage 2 (ADR 018), the `fire` object only. A name of the occupational safety set
// would mark these drafts as changed when it does.
describe('fire-safety set', () => {
  const fireUrl = new URL('fire/', templatesUrl);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', fireUrl), 'utf8')) as {
    templates: { number: string; typeKey: string; title: string; file: string; stage: number }[];
  };
  const stageOne = manifest.templates
    .filter((entry) => entry.stage === 1)
    .map((entry) => `fire/${entry.file}`);
  // Stage 3 (ADR 019) merges the same names, the technician's certificate and authorization too.
  const stageTwo = manifest.templates
    .filter((entry) => entry.stage >= 2)
    .map((entry) => `fire/${entry.file}`);
  const allowed = [
    'branding',
    'client.legalName',
    'client.representativeName',
    'client.representativeRole',
    'fireSafetyTechnician.name',
    'provider.legalName',
  ];
  const data = {
    branding: true,
    client: {
      legalName: 'S.C. CLIENT DEMO S.R.L.',
      representativeName: 'Maria POPESCU',
      representativeRole: 'Administrator',
    },
    provider: { legalName: 'S.C. SERVICIU EXTERN S.R.L.' },
    fireSafetyTechnician: { name: 'Dan MARIN' },
  };
  const technician = {
    name: 'Dan MARIN',
    certificate: 'seria A nr. 1234/2024',
    authorization: 'nr. 12 din 15.09.2026, ISU Timiș',
  };
  const person = { name: 'Ion VLAD', jobTitle: 'Șef magazin' };
  const workplace = {
    first: true,
    name: 'Magazin',
    activity: 'Gelaterie',
    address: 'Timișoara, județul Timiș, Str. Lungă 5',
    floorAreaM2: 120,
    normLabel: 'Clădiri comerciale (1 buc./200 m²)',
    assemblyPoint: 'Parcarea din spate',
    combustibleMaterials: 'Cartoane',
    ignitionSources: 'Instalația electrică',
    fireRiskEquipment: 'Vitrine frigorifice',
    specificMeasures: 'Vitrinele se opresc noaptea.',
    extinguishers: [
      { code: 'P6', agentLabel: 'Pulbere', capacityLabel: '6 kg', wheeled: false, count: 2 },
      { code: 'P50', agentLabel: 'Pulbere', capacityLabel: '50 kg', wheeled: true, count: 1 },
    ],
    extinguisherCount: 3,
    otherEquipment: [{ kindLabel: 'Ladă cu nisip', count: 1 }],
    installations: [{ kindLabel: 'Hidranți interiori', description: 'Unul pe nivel' }],
    hasInstallations: true,
    hasExteriorHydrants: true,
    hasInteriorHydrants: true,
    manager: person,
    firstIntervention: [{ ...person, roleLabel: 'șef echipă de primă intervenție' }],
    firstInterventionNames: 'Ion VLAD',
    interventionLeaderName: 'Ion VLAD',
  };
  const fire = {
    decisionNumbers: {
      organization: '4 PSI',
      training: '5 PSI',
      openFire: '6 PSI',
      smoking: '7 PSI',
      seasons: '8 PSI',
      technician: '9 PSI',
      instructions: '10 PSI',
      waste: '11 PSI',
      control: '12 PSI',
    },
    schedule: {
      periodicHours: 2,
      periodicLabel: '2 ore',
      administrativeIntervalMonths: 6,
      administrativeIntervalLabel: '6 LUNI',
      administrativeMonths: 'lunile februarie și august',
      workerIntervalMonths: 3,
      workerIntervalLabel: '3 LUNI',
      workerMonths: 'lunile februarie, mai, august și noiembrie',
      firstMonth: 2,
      firstMonthLabel: 'februarie',
      dayFrom: 2,
      dayTo: 7,
    },
    staff: {
      administrative: ['Manager magazin'],
      execution: ['Barman'],
      administrativeText: 'Manager magazin',
      executionText: 'Barman',
    },
    coordinator: person,
    interventionLeader: person,
    workplaceManagers: [{ ...person, workplaceName: null }],
    designated: [person],
    workplaces: [workplace, { ...workplace, first: false, name: 'Depozit' }],
    hasExteriorHydrants: true,
    hasGasExtinguishers: true,
    smoking: {
      policy: 'designated_places',
      forbiddenEverywhere: false,
      designatedPlaces: true,
      place: 'în curtea interioară',
    },
    waste: { kinds: ['deșeuri de carton'], contractor: 'S.C. ECO S.R.L.' },
    themes: [
      {
        staffCategory: 'technical_administrative',
        label: 'Personal administrativ',
        posts: ['Manager magazin'],
        postsText: 'Manager magazin',
        workplaceTrainers: { workplaceManagers: null, technician: true },
        periodicTrainers: { workplaceManagers: null, technician: true },
        intervalLabel: '6 LUNI',
        sessions: [
          { month: 'FEBRUARIE', content: 'IPSU Art. 1 – 130; Afișate', duration: '120 min' },
          {
            month: 'AUGUST',
            content: 'IPSU Art. 131 – 257; Afișate; Testare.',
            duration: '120 min',
          },
        ],
      },
      {
        staffCategory: 'execution',
        label: 'Personal de execuție',
        posts: ['Barman'],
        postsText: 'Barman',
        workplaceTrainers: {
          workplaceManagers: 'Ion VLAD – conducătorul locului de muncă',
          technician: false,
        },
        periodicTrainers: {
          workplaceManagers: 'Ion VLAD – conducătorul locului de muncă',
          technician: true,
        },
        intervalLabel: '3 LUNI',
        sessions: [
          { month: 'FEBRUARIE', content: 'IPSU Art. 1 – 76; Afișate', duration: '120 min' },
          {
            month: 'NOIEMBRIE',
            content: 'IPSU Art. 236 – 257; Afișate; Testare.',
            duration: '120 min',
          },
        ],
      },
    ],
  };
  // Every condition the other way: no contractor, no manager at a workplace, nothing optional.
  const sparse = {
    ...fire,
    staff: { ...fire.staff, administrative: [], administrativeText: null },
    workplaces: [
      {
        ...workplace,
        specificMeasures: '',
        otherEquipment: [],
        installations: [],
        hasInstallations: false,
        hasExteriorHydrants: false,
        hasInteriorHydrants: false,
        manager: null,
        firstIntervention: [],
      },
    ],
    hasExteriorHydrants: false,
    hasGasExtinguishers: false,
    smoking: {
      policy: 'forbidden_everywhere',
      forbiddenEverywhere: true,
      designatedPlaces: false,
      place: null,
    },
    waste: { kinds: ['deșeuri menajere'], contractor: null },
    themes: fire.themes.slice(1),
  };
  const stageTwoData = {
    ...data,
    issueDate: '19.01.2026',
    fireSafetyTechnician: technician,
    fire,
  };

  it('are the files of their manifest, named after their numbers and their types', () => {
    expect(manifest.templates.map((entry) => `fire/${entry.file}`).sort()).toEqual(
      [...fireFiles].sort()
    );
    for (const entry of manifest.templates) {
      expect(entry.file).toBe(`${entry.number}_${entry.typeKey}.docx`);
      expect(entry.typeKey).toMatch(/^fire_[a-z0-9_]{1,54}$/);
      expect(entry.title).toBeTruthy();
      expect([1, 2, 3]).toContain(entry.stage);
    }
    expect(new Set(manifest.templates.map((entry) => entry.typeKey)).size).toBe(
      manifest.templates.length
    );
  });

  it.each(stageOne)('%s asks only for the shared facts and the technician', (name) => {
    expect(
      templatePlaceholders(read(name)).filter((placeholder) => !allowed.includes(placeholder))
    ).toEqual([]);
    expect(documentText(renderDocument(read(name), data))).not.toContain('{{');
  });

  // Inside a loop a name is the item's, so only the dotted ones are held to the list.
  it.each(stageTwo)('%s asks for the shared facts and the `fire` object only', (name) => {
    expect(
      templatePlaceholders(read(name)).filter(
        (placeholder) =>
          placeholder.includes('.') &&
          placeholder !== '.' &&
          !allowed.includes(placeholder) &&
          !placeholder.startsWith('fire.') &&
          !placeholder.startsWith('fireSafetyTechnician.')
      )
    ).toEqual([]);
  });

  it.each(
    stageTwo.flatMap((name) => [
      [name, 'every fact', fire] as const,
      [name, 'the fewest', sparse] as const,
    ])
  )('%s renders from %s with nothing missing', (name, _, variant) => {
    const text = documentText(
      renderDocument(read(name), {
        ...stageTwoData,
        fireSafetyTechnician:
          variant === sparse ? { ...technician, authorization: null } : technician,
        fire: variant,
      })
    );
    expect(text).not.toContain('{{');
    expect(text).toContain('S.C. CLIENT DEMO S.R.L.');
  });

  it('numbers each decision as its place in the binder says', () => {
    const numbers = {
      'fire/1.1_fire_decision_organization.docx': '4 PSI',
      'fire/1.2_fire_decision_training.docx': '5 PSI',
      'fire/1.3_fire_decision_open_fire.docx': '6 PSI',
      'fire/1.4_fire_decision_smoking.docx': '7 PSI',
      'fire/1.5_fire_decision_seasons.docx': '8 PSI',
      'fire/1.6_fire_decision_technician.docx': '9 PSI',
      'fire/1.7_fire_decision_instructions.docx': '10 PSI',
      'fire/1.8_fire_decision_waste.docx': '11 PSI',
      'fire/1.9_fire_decision_control.docx': '12 PSI',
    };
    for (const [name, number] of Object.entries(numbers)) {
      const text = documentText(renderDocument(read(name), stageTwoData));
      expect(text).toContain(`Nr. ${number} din 19.01.2026`);
      expect(text).toContain(`nr. ${number} din 19.01.2026.`);
    }
  });

  it('numbers the responsibilities under contracts as an item of decision 1 of its own', () => {
    const xml = new PizZip(read('fire/1.1_fire_decision_organization.docx'))
      .file('word/document.xml')!
      .asText();
    const numbering = (start: string) => {
      const paragraph = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).find((each) =>
        documentTextOf(each).startsWith(start)
      )!;
      return /<w:ilvl w:val="(\d)"\/><w:numId w:val="(\d+)"\/>/.exec(paragraph)!.slice(1);
    };
    const contracts = numbering('Pentru stabilirea răspunderilor');
    expect(contracts[0]).toBe('0');
    expect(contracts).toEqual(numbering('Pentru analiza evenimentelor'));
  });

  it('prints the interval of a staff category in decision 2 only when it has posts', () => {
    const decision = 'fire/1.2_fire_decision_training.docx';
    const full = documentText(renderDocument(read(decision), stageTwoData));
    expect(full).toContain('personalul administrativ (Manager magazin) va fi instruit la 6 LUNI');
    expect(full).toContain('personalul de execuție (Barman) va fi instruit la 3 LUNI');
    const sparseText = documentText(
      renderDocument(read(decision), { ...stageTwoData, fire: sparse })
    );
    expect(sparseText).not.toContain('personalul administrativ');
    expect(sparseText).toContain('personalul de execuție (Barman) va fi instruit la 3 LUNI');
  });

  it('names the contractor of the waste, or the contracted firm', () => {
    const decision = 'fire/1.8_fire_decision_waste.docx';
    expect(documentText(renderDocument(read(decision), stageTwoData))).toContain(
      'și S.C. ECO S.R.L., firmă autorizată în acest domeniu.'
    );
    expect(
      documentText(renderDocument(read(decision), { ...stageTwoData, fire: sparse }))
    ).toContain('și firma contractată, autorizată în acest domeniu.');
  });

  it('prints the exterior-hydrant accessories only for a client with exterior hydrants', () => {
    const list = 'fire/5.1_fire_means_list.docx';
    const accessories = 'Lista dotării cu accesorii pentru trecerea apei';
    expect(documentText(renderDocument(read(list), stageTwoData))).toContain(accessories);
    expect(
      documentText(renderDocument(read(list), { ...stageTwoData, fire: sparse }))
    ).not.toContain(accessories);
  });

  it('prints the smoking rule of decision 4 and of the posted sheet', () => {
    const decision = 'fire/1.4_fire_decision_smoking.docx';
    const sheet = 'fire/5.2_fire_workplace_organization.docx';
    const placeless = { ...fire, smoking: { ...fire.smoking, place: null } };
    const allowed = documentText(renderDocument(read(decision), stageTwoData));
    expect(allowed).toContain(
      'Fumatul este permis numai în locurile special amenajate în exteriorul clădirilor, în curtea interioară, marcate'
    );
    expect(allowed).toContain('40\u00a0m față de locurile în care există pericol de explozie');
    expect(allowed).not.toContain('atât în interiorul, cât și în exteriorul clădirilor');
    expect(
      documentText(renderDocument(read(decision), { ...stageTwoData, fire: placeless }))
    ).toContain(
      'Fumatul este permis numai în locurile special amenajate în exteriorul clădirilor, marcate'
    );
    const forbidden = documentText(
      renderDocument(read(decision), { ...stageTwoData, fire: sparse })
    );
    expect(forbidden).toContain(
      'Fumatul este interzis în toate spațiile și pe întreaga incintă a S.C. CLIENT DEMO S.R.L., atât în interiorul, cât și în exteriorul clădirilor.'
    );
    expect(forbidden).not.toContain('LOC PENTRU FUMAT');
    expect(documentText(renderDocument(read(sheet), stageTwoData))).toContain(
      '– fumatul este permis numai în exteriorul clădirilor, în locurile amenajate și marcate „LOC PENTRU FUMAT” (în curtea interioară), conform Deciziei nr. 7 PSI;'
    );
    expect(documentText(renderDocument(read(sheet), { ...stageTwoData, fire: sparse }))).toContain(
      '– fumatul este interzis în toate spațiile și pe întreaga incintă a unității, conform Deciziei nr. 7 PSI;'
    );
  });

  it('appoints the technician with the certificate, and the authorization only when it is set', () => {
    const decision = 'fire/1.6_fire_decision_technician.docx';
    const text = documentText(renderDocument(read(decision), stageTwoData));
    expect(text).toContain(
      'de Dan MARIN, cadru tehnic cu atribuții în domeniul apărării împotriva incendiilor, certificat seria A nr. 1234/2024'
    );
    expect(text).toContain(
      'prin autorizația nr. 12 din 15.09.2026, ISU Timiș, pentru îndeplinirea atribuțiilor'
    );
    expect(text).toContain('(Preluare din Legea 307/2006 – Art. 27 alin. (1))');
    for (const letter of 'abcdefghijklm') expect(text).toMatch(new RegExp(`^${letter}\\)\\S`, 'm'));
    const unauthorized = documentText(
      renderDocument(read(decision), {
        ...stageTwoData,
        fireSafetyTechnician: { ...technician, authorization: null },
      })
    );
    expect(unauthorized).not.toContain('autorizația');
    expect(unauthorized).not.toContain('Art. 12²');
  });

  it('weighs the gas extinguishers in decision 9 only for a client that has some', () => {
    const decision = 'fire/1.9_fire_decision_control.docx';
    const weighing = 'Stingătoarele cu CO₂ sau agent curat, prin cântărire';
    const text = documentText(renderDocument(read(decision), stageTwoData));
    expect(text).toContain(weighing);
    expect(text).toContain('verificarea prin cântărire a stingătoarelor cu CO₂ sau agent curat');
    const without = documentText(renderDocument(read(decision), { ...stageTwoData, fire: sparse }));
    expect(without).not.toContain(weighing);
    expect(without).not.toContain('cântărire');
    for (const month of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'])
      expect(without).toMatch(new RegExp(`^${month}$`, 'm'));
  });

  it('posts the instructions of every workplace on pages of their own, its means said alike twice', () => {
    const decision = 'fire/1.7_fire_decision_instructions.docx';
    const merged = renderDocument(read(decision), stageTwoData);
    const xml = new PizZip(merged).file('word/document.xml')!.asText();
    expect(xml.match(/<w:br w:type="page"\/>/g)).toHaveLength(2);
    const text = documentText(merged);
    expect(text.match(/^INSTRUCȚIUNI DE APĂRARE ÎMPOTRIVA INCENDIILOR$/gm)).toHaveLength(2);
    expect(text).toContain('Anexă la Decizia nr. 10 PSI din 19.01.2026');
    expect(text).toMatch(
      /^Locul de muncă: Depozit, Gelaterie\nAdresa: Timișoara, județul Timiș, Str. Lungă 5$/m
    );
    expect(text).toContain('Stingător tip P50 – Pulbere, 50 kg, carosabil: 1 buc.;');
    expect(text).toMatch(/^P50\nPulbere\n50 kg, carosabil\n1$/m);
    expect(text).toMatch(/^Total\n3$/m);
    expect(text).toContain(
      'personalul de execuție la 3 LUNI, respectiv în lunile februarie, mai, august și noiembrie, conform Deciziei nr. 5 PSI;'
    );
    expect(text).toContain('redate în Decizia nr. 9 PSI.');
    expect(text).toContain('(Preluare din Legea 307/2006 – Art. 19 alin. (1))');
    expect(text).toMatch(/^r¹⁶\)/m);
    expect(text).toContain(
      'Fumatul este permis numai în locurile amenajate în exteriorul clădirilor (în curtea interioară)'
    );
    expect(text.match(/^Conduita salvatorului cuprinde, în această ordine:$/gm)).toHaveLength(2);
    expect(text).not.toContain('50-60');
    const sparseText = documentText(
      renderDocument(read(decision), { ...stageTwoData, fire: sparse })
    );
    expect(sparseText).toContain(
      'Fumatul este interzis în toate spațiile și pe întreaga incintă a S.C. CLIENT DEMO S.R.L., conform Deciziei nr. 7 PSI.'
    );
    expect(sparseText).not.toContain('LOC PENTRU FUMAT');
    expect(sparseText).not.toContain('Măsuri specifice locului de muncă');
  });

  // The engine repeats a list's paragraphs under one numbering: a counted list would count on
  // from one workplace to the next.
  it('counts no list in the posted instructions, which repeat per workplace', () => {
    const zip = new PizZip(read('fire/1.7_fire_decision_instructions.docx'));
    const xml = zip.file('word/document.xml')!.asText();
    const numbering = zip.file('word/numbering.xml')!.asText();
    const firstLevelFormat = (numId: string) => {
      const num = new RegExp(`<w:num w:numId="${numId}"[^>]*>[\\s\\S]*?</w:num>`).exec(
        numbering
      )![0];
      const override = /<w:lvlOverride w:ilvl="0">[\s\S]*?<w:numFmt w:val="(\w+)"/.exec(num)?.[1];
      if (override) return override;
      const abstractId = /<w:abstractNumId w:val="(\d+)"/.exec(num)![1];
      const abstract = new RegExp(
        `<w:abstractNum [^>]*w:abstractNumId="${abstractId}"[\\s\\S]*?</w:abstractNum>`
      ).exec(numbering)![0];
      return /<w:lvl w:ilvl="0"[\s\S]*?<w:numFmt w:val="(\w+)"/.exec(abstract)![1];
    };
    const posted = xml.slice(xml.indexOf('INSTRUCȚIUNI DE APĂRARE ÎMPOTRIVA INCENDIILOR'));
    const numIds = new Set(
      [...posted.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((match) => match[1]!)
    );
    numIds.delete('0');
    expect(numIds.size).toBeGreaterThan(0);
    expect([...numIds].map(firstLevelFormat).filter((format) => format !== 'bullet')).toEqual([]);
  });

  it('gives every workplace a page of its own on the posted sheet', () => {
    const sheet = renderDocument(read('fire/5.2_fire_workplace_organization.docx'), stageTwoData);
    const xml = new PizZip(sheet).file('word/document.xml')!.asText();
    expect(xml.match(/<w:br w:type="page"\/>/g)).toHaveLength(1);
    expect(documentText(sheet).match(/ORGANIZAREA APĂRĂRII ÎMPOTRIVA INCENDIILOR/g)).toHaveLength(
      2
    );
  });

  it('marks an unset specific measure with a dash on the posted sheet', () => {
    const sheet = 'fire/5.2_fire_workplace_organization.docx';
    expect(documentText(renderDocument(read(sheet), stageTwoData))).toMatch(
      /^5\. Măsuri specifice\nVitrinele se opresc noaptea\.$/m
    );
    expect(documentText(renderDocument(read(sheet), { ...stageTwoData, fire: sparse }))).toMatch(
      /^5\. Măsuri specifice\n—$/m
    );
  });

  it.each(fireFiles)('%s keeps no author, company or title of the original', (name) => {
    const zip = new PizZip(read(name));
    const core = zip.file('docProps/core.xml')?.asText() ?? '';
    for (const tag of ['dc:creator', 'cp:lastModifiedBy', 'dc:title']) {
      expect(new RegExp(`<${tag}>[^<]+</${tag}>`).test(core), tag).toBe(false);
    }
    expect(zip.file('docProps/app.xml')?.asText() ?? '').not.toMatch(/<(Company|Manager)>[^<]/);
  });

  it.each([
    'fire/6.0_fire_cover_registers.docx',
    'fire/1.0_fire_cover_decisions.docx',
    'fire/2.0_fire_cover_own_instructions.docx',
    'fire/3.0_fire_cover_training_themes.docx',
    'fire/4.0_fire_cover_tests.docx',
  ])('%s has the technician sign for the provider', (name) => {
    const text = documentText(renderDocument(read(name), data));
    expect(text).toContain('Dan MARIN\nCadru tehnic PSI al S.C. SERVICIU EXTERN S.R.L.');
    expect(text).toContain('Maria POPESCU\nAdministrator al S.C. CLIENT DEMO S.R.L.');
  });

  it('lists the nine decisions of the binder on their cover', () => {
    const text = documentText(read('fire/1.0_fire_cover_decisions.docx'));
    for (let item = 1; item <= 9; item++) expect(text).toMatch(new RegExp(`^${item}\\. `, 'm'));
  });

  it('keeps the general chapters of the own instructions, its contents without page numbers', () => {
    const text = documentText(
      renderDocument(read('fire/2.1_fire_own_instructions.docx'), stageTwoData)
    );
    expect(text.match(/^Capitolul [IVX]+\. /gm)).toHaveLength(23);
    expect(text).toMatch(/^XXII\. Stingătoarele de incendiu$/m);
    expect(text).toContain('(Preluare din OMAI 135/2023 – Anexa 1)');
    expect(text).toContain('(Preluare din OMAI 712/2005 – Art. 21) Instructajul periodic');
    expect(text).toContain('pe o durată de cel puțin două ore');
    expect(text).toContain(
      'testul de verificare a cunoștințelor privind situațiile de urgență la angajare'
    );
    expect(text).toContain(
      'testul anual de verificare a cunoștințelor privind situațiile de urgență'
    );
    for (const gone of [
      '60 minute',
      'TLMSU',
      'cazărmi',
      '0-ZERO',
      '50-60',
      'haloni',
      'Tehnici de securitate la incendiu',
      'spumă chimică',
      'funcționează prin răsturnare',
      'tip S',
    ]) {
      expect(text).not.toContain(gone);
    }
  });

  it('gives every staff category with posts a block of the workplace and the periodic training', () => {
    const themes = 'fire/3.1_fire_training_themes.docx';
    const text = documentText(renderDocument(read(themes), stageTwoData));
    expect(text.match(/^FUNCȚIA: Personal administrativ \(Manager magazin\)$/gm)).toHaveLength(2);
    expect(text).toContain(
      'CINE EFECTUEAZĂ INSTRUIREA: Ion VLAD – conducătorul locului de muncă\n'
    );
    expect(text).toContain(
      'CINE EFECTUEAZĂ INSTRUIREA: Ion VLAD – conducătorul locului de muncă sau, după caz, S.C. SERVICIU EXTERN S.R.L. – Dan MARIN (cadru tehnic PSI)'
    );
    expect(text).toContain('Decizia nr. 10 PSI');
    expect(text).toMatch(/^NOIEMBRIE\nIPSU Art. 236 – 257; Afișate; Testare.\n120 min$/m);
    const sparseText = documentText(
      renderDocument(read(themes), { ...stageTwoData, fire: sparse })
    );
    expect(sparseText).not.toContain('Personal administrativ');
    expect(sparseText.match(/^FUNCȚIA: Personal de execuție \(Barman\)$/gm)).toHaveLength(2);
  });

  // OMAI 712/2005 art. 13 and 18 ask eight hours of training, which the breaks are not.
  it('counts eight hours of training in each plan, its breaks without minutes', () => {
    const text = documentText(read('fire/3.1_fire_training_themes.docx'));
    const plans = text.split('TIMP TOTAL DE INSTRUIRE').slice(0, -1);
    expect(plans).toHaveLength(2);
    for (const plan of plans) {
      const rows = plan.slice(plan.lastIndexOf('Planul de desfășurare'));
      const minutes = [...rows.matchAll(/^(\d+) min$/gm)].map(([, value]) => Number(value));
      expect(minutes.reduce((sum, value) => sum + value, 0)).toBe(480);
      expect(rows).toContain('PAUZA');
      expect(rows).not.toMatch(/^PAUZA\n\d+ min$/m);
    }
    expect(text).toMatch(/^TIMP TOTAL DE INSTRUIRE\n480 min$/m);
  });

  it.each([
    ['fire/4.1_fire_test_hiring.docx', 12, 'A'],
    ['fire/4.2_fire_test_annual.docx', 10, 'A'],
  ])(
    '%s asks %i questions, one row per question on the sheet and in the key',
    (name, count, last) => {
      const text = documentText(renderDocument(read(name), stageTwoData));
      expect(text.match(/^\d+\. /gm)).toHaveLength(count * 2);
      expect(text).toMatch(new RegExp(`^${count}\\. `, 'm'));
      expect(text).not.toMatch(new RegExp(`^${count + 1}\\. `, 'm'));
      const sheet = text.slice(text.indexOf('Răspunsul acordat'), text.lastIndexOf('TESTARE'));
      expect(sheet.match(/^\d+$/gm)).toHaveLength(count);
      const key = text.slice(text.indexOf('Răspunsul corect'));
      expect(key.match(/^\d+\n[A-D]+$/gm)).toHaveLength(count);
      expect(key).toMatch(new RegExp(`^${count}\\n${last}$`, 'm'));
      for (const gone of [
        'funcții de execuție sau operative',
        'termenul de valabilitate',
        'culorii',
        'bătăile inimii',
        'Spuma chimică',
      ]) {
        expect(text).not.toContain(gone);
      }
    }
  );

  it('lists the two tests on their cover', () => {
    const text = documentText(read('fire/4.0_fire_cover_tests.docx'));
    expect(text).toMatch(/^1\. Test de verificare a cunoștințelor la angajare/m);
    expect(text).toMatch(/^2\. Test de verificare periodică \(anual\)\.$/m);
  });

  it('prints the checks of OMAI 135/2023 annex 2, each answered yes or no', () => {
    const text = documentText(read('fire/6.4_fire_extinguisher_register.docx'));
    expect(text.match(/^DA$/gm)).toHaveLength(8);
    expect(text.match(/^NU$/gm)).toHaveLength(8);
    for (const letter of 'abcdefgh') expect(text).toMatch(new RegExp(`^${letter}\\)`, 'm'));
  });

  it('prints the fifteen measures of the permit and who signs it', () => {
    const text = documentText(read('fire/6.2_fire_work_permit.docx'));
    for (let item = 1; item <= 15; item++) expect(text).toMatch(new RegExp(`^${item}\\. `, 'm'));
    for (const signer of [
      'Emitentul',
      'Șeful sectorului în care se execută lucrările',
      'Executanții lucrărilor cu foc',
      'Serviciul public voluntar/privat pentru situații de urgență',
    ]) {
      expect(text).toContain(signer);
    }
  });
});

// Every original of the provider's pack is listed, ported or not, under its own number, so
// the folder shows at a glance what is still to do. Decision 1.5 came later, from a third pack.
describe('manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', templatesUrl), 'utf8')) as {
    templates: {
      number: string;
      original: string;
      stage: number;
      typeKey: string | null;
      title: string | null;
      file: string | null;
    }[];
  };
  const ported = manifest.templates.filter((entry) => entry.file);

  it('lists all 24 originals once', () => {
    expect(manifest.templates).toHaveLength(24);
    expect(new Set(manifest.templates.map((entry) => entry.number)).size).toBe(24);
  });

  it('names each ported template after its original number and its type', () => {
    for (const entry of ported) {
      expect(entry.file).toBe(`${entry.number}_${entry.typeKey}.docx`);
      expect(entry.typeKey).toMatch(/^[a-z][a-z0-9_]{1,59}$/);
      expect(entry.title).toBeTruthy();
    }
    expect(new Set(ported.map((entry) => entry.typeKey)).size).toBe(ported.length);
  });

  it('matches the files in the folder exactly', () => {
    expect(ported.map((entry) => entry.file).sort()).toEqual([...templateFiles].sort());
  });
});

// The database's bounds for a version's note (ADR 017): a note out of them would fail only
// when the templates are registered, after the merge.
describe.each(['', 'other/', 'fire/'])(
  'the change of each template in %smanifest.json',
  (folder) => {
    const manifest = JSON.parse(
      readFileSync(new URL(`${folder}manifest.json`, templatesUrl), 'utf8')
    ) as { templates: { typeKey: string; change?: { kind?: string; note?: string } }[] };

    it.each(manifest.templates.map((entry) => [entry.typeKey, entry.change] as const))(
      '%s says what kind of change it was, in a note',
      (_typeKey, change) => {
        expect(['legal', 'correction', 'layout']).toContain(change?.kind);
        expect(change?.note?.trim().length).toBeGreaterThanOrEqual(2);
        expect(change?.note?.trim().length).toBeLessThanOrEqual(500);
      }
    );
  }
);

const bodyOf = (name: string) => new PizZip(read(name)).file('word/document.xml')!.asText();

// The house style the import script typesets every template to.
describe('typesetting', () => {
  const paragraphsOf = (xml: string) => xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];

  it.each(decisionFiles)('%s centres the signature block instead of spacing it out', (name) => {
    for (const placeholder of [
      '{{client.legalName}}',
      '{{client.representativeRole}}',
      '{{client.representativeName}}',
    ]) {
      const block = paragraphsOf(bodyOf(name)).filter(
        (paragraph) => documentTextOf(paragraph) === placeholder
      );
      expect(block.length, placeholder).toBeGreaterThan(0);
      for (const paragraph of block) expect(paragraph).toContain('<w:jc w:val="center"/>');
    }
  });

  // The in-app editor evaluates a page field only when its code is the bare keyword; the
  // "\\* ARABIC" LibreOffice spells out makes it paint the cached result on every page.
  it.each(typesetFiles)('%s writes its page fields without a format switch', (name) => {
    const zip = new PizZip(read(name));
    const parts = Object.keys(zip.files).filter((file) =>
      /^word\/(header|footer)\d*\.xml$/.test(file)
    );
    const codes = parts.flatMap(
      (part) =>
        zip
          .file(part)!
          .asText()
          .match(/<w:instrText[^>]*>[^<]*<\/w:instrText>/g) ?? []
    );
    expect(codes.filter((code) => /PAGE/.test(code) && /\\\*/.test(code))).toEqual([]);
  });

  it.each(typesetFiles)('%s numbers its pages through, without a restart', (name) => {
    expect(bodyOf(name)).not.toMatch(/<w:pgNumType\b[^>]*w:start=/);
  });

  it.each(typesetFiles)(
    '%s aligns nothing with spaces and spaces nothing with empty paragraphs',
    (name) => {
      // A table cell or a text box may be empty; a paragraph that holds a picture is not.
      const body = bodyOf(name)
        .replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '<w:tbl/>')
        .replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, '');
      const texts = paragraphsOf(body).map(documentTextOf);
      expect(texts.filter((text) => /^[ \u00a0\t]/.test(text))).toEqual([]);
      // Loop tags stand alone in a paragraph. The only empty paragraphs are the ones Word needs
      // after a table: at the end, or between two tables that would otherwise be saved as one;
      // and a page break that a section prints for some items of a loop only.
      const empty = paragraphsOf(body).filter(
        (paragraph) =>
          documentTextOf(paragraph).trim() === '' &&
          !/<w:drawing|<w:object|<w:pict|<mc:AlternateContent|<w:br w:type="page"\/>/.test(
            paragraph
          )
      );
      // Or set at 1 pt, where it takes no room: one original cannot be saved without them.
      for (const paragraph of empty.filter((item) => !item.includes('<w:sz w:val="2"/>'))) {
        expect(body.slice(0, body.indexOf(paragraph)).trimEnd()).toMatch(/<w:tbl\/>$/);
      }
    }
  );

  it.each(typesetFiles)('%s uses one font, the body and title sizes, and Romanian', (name) => {
    const xml = bodyOf(name);
    // Of the runs that carry text, here and below: a paragraph's end mark may keep a font, a
    // size or a language of its own, which nothing shows and LibreOffice does not let go of.
    const fonts = new Set(
      [
        ...xml.matchAll(
          /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:rFonts [^>]*w:ascii="([^"]+)"(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/g
        ),
      ].map((match) => match[1])
    );
    const sizes = new Set(
      [
        ...xml.matchAll(
          /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/g
        ),
      ].map((match) => Number(match[1]) / 2)
    );
    // Of the runs that carry text: that is what spell-check and hyphenation read. A paragraph's
    // end mark may keep a language of its own, which nothing shows.
    const languages = new Set(
      [
        ...xml.matchAll(
          /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:lang [^>]*w:val="([^"]+)"(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/g
        ),
      ].map((match) => match[1])
    );
    expect([...fonts]).toEqual(['Arial']);
    // 10 pt body; 12 pt document titles; 14 and 16 pt on a cover page. Smaller only inside a
    // table too wide for the body size, never for a heading over running text.
    expect([...sizes].filter((size) => ![7, 8, 9, 10, 12, 14, 16].includes(size))).toEqual([]);
    const outsideTables = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '');
    expect(outsideTables).not.toMatch(
      /<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:sz w:val="(14|16|18)"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t[ >]/
    );
    expect([...languages]).toEqual(['ro-RO']);
  });

  it.each(typesetFiles)('%s justifies nothing', (name) => {
    // Without hyphenation a justified line opens uneven gaps between words.
    expect(bodyOf(name)).not.toContain('<w:jc w:val="both"/>');
  });

  it.each(typesetFiles)("%s names none of LibreOffice's own fonts in its styles", (name) => {
    // No text uses them, but a viewer without them warns that it shows substitutes.
    const styles = new PizZip(read(name)).file('word/styles.xml')!.asText();
    expect(styles).not.toMatch(/"(Liberation (Serif|Sans)|Noto [^"]*)"/);
  });

  it.each(typesetFiles)('%s has no picture floating at the left between two lines', (name) => {
    // The in-app editor cannot lay out the page around one; as a character it looks the same.
    const floating = bodyOf(name).match(/<wp:anchor .*?<\/wp:anchor>/gs) ?? [];
    const atTheLeft = floating.filter((anchor) => {
      const offset = /<wp:positionH\b.*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/s.exec(anchor);
      return (
        anchor.includes('<wp:wrapTopAndBottom') && offset && Math.abs(Number(offset[1])) <= 360000
      );
    });
    expect(atTheLeft).toHaveLength(0);
  });

  it.each(typesetFiles)('%s contains no hyperlinks', (name) => {
    // The originals carry dead internal links, and clearing them carelessly wraps all the text
    // in a link to nowhere, which some viewers draw as links.
    expect(bodyOf(name)).not.toContain('<w:hyperlink');
  });

  it.each(typesetFiles)(
    '%s has the house margins, no header but the document details, and a footer that ends with the branding line',
    (name) => {
      const xml = bodyOf(name);
      // 25 mm left for binding, 20 mm elsewhere, in twentieths of a point.
      expect(xml).toMatch(/<w:pgMar [^>]*w:left="1417"[^>]*w:right="1134"/);
      // The footer sits inside the bottom margin: 12 mm to the footer, the text ends above 20 mm.
      expect(xml).toMatch(/<w:pgMar [^>]*w:footer="680"/);
      const bottom = Number(/<w:pgMar [^>]*w:bottom="(\d+)"/.exec(xml)![1]);
      expect(bottom).toBeGreaterThanOrEqual(1134);
      expect(bottom).toBeLessThan(1500);
      // No header, or the box of document details, which sits inside the top margin the way
      // the footer sits inside the bottom one. Every footer ends with the branding line, which
      // the merge data switches.
      const zip = new PizZip(read(name));
      const parts = Object.keys(zip.files);
      const headers = parts
        .filter((file) => /word\/header\d*\.xml/.test(file))
        .map((part) => documentTextOf(zip.file(part)!.asText()).trim());
      if (headers.every((text) => text === '')) {
        expect(xml).toMatch(/<w:pgMar [^>]*w:top="1134"/);
      } else {
        expect(xml).toMatch(/<w:pgMar [^>]*w:header="680"/);
        for (const text of headers) {
          expect(text).toContain('Data întocmirii documentului:{{issueDate}}');
          expect(text).toContain('Întocmit pentru:{{client.legalName}}');
          expect(text).toMatch(/Cod document:.+Denumire document:.+(Pag\. |Anexa \{\{number\}\})/);
        }
      }
      const footers = parts.filter((file) => /word\/footer\d*\.xml/.test(file));
      expect(footers.length).toBeGreaterThan(0);
      for (const part of footers) {
        expect(documentTextOf(zip.file(part)!.asText()), part).toMatch(
          /\{\{#branding\}\}Document generat cu SSM Ușor · ssmusor\.ro\{\{\/branding\}\}$/
        );
      }
    }
  );

  const keepsNext = (properties: string) => {
    const match = /<w:keepNext(?: w:val="(\w+)")?\/>/.exec(properties);
    return match ? !['false', '0', 'off'].includes(match[1] ?? 'true') : undefined;
  };

  // The Heading styles of the imported files keep with the next paragraph too.
  const keepingOf = (name: string) => {
    const styles = new PizZip(read(name)).file('word/styles.xml')!.asText();
    const definitions = new Map(
      [...styles.matchAll(/<w:style ([^>]*)>([\s\S]*?)<\/w:style>/g)]
        .filter(([, attributes = '']) => attributes.includes('w:type="paragraph"'))
        .map(([, attributes = '', body = '']) => [
          /w:styleId="([^"]+)"/.exec(attributes)![1]!,
          {
            basedOn: /<w:basedOn w:val="([^"]+)"/.exec(body)?.[1],
            own: keepsNext(/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(body)?.[0] ?? ''),
            isDefault: /w:default="(1|true)"/.test(attributes),
          },
        ])
    );
    const styleKeeps = (id: string | undefined, depth = 0): boolean => {
      const style = id === undefined ? undefined : definitions.get(id);
      if (!style || depth > 20) return false;
      return style.own ?? styleKeeps(style.basedOn, depth + 1);
    };
    const defaultStyle = [...definitions].find(([, style]) => style.isDefault)?.[0];
    return (block: string) => {
      if (block.startsWith('<w:tbl>')) return false;
      const style = /<w:pStyle w:val="([^"]+)"/.exec(propertiesOf(block))?.[1] ?? defaultStyle;
      return keepsNext(propertiesOf(block)) ?? styleKeeps(style);
    };
  };
  const propertiesOf = (block: string) =>
    /^<w:p\b[^>]*>\s*<w:pPr>[\s\S]*?<\/w:pPr>/.exec(block)?.[0] ?? '';
  // The originals typed many of their lists' letters and dashes by hand.
  const isListItem = (block: string) =>
    block.startsWith('<w:p') &&
    (propertiesOf(block).includes('<w:numPr>') ||
      /^([a-z]\)|\d{1,2}[.)]\s|[-–•]\s)/.test(documentTextOf(block).trim()));
  const blocksOf = (name: string) =>
    bodyOf(name).match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];

  // A heading, the paragraph that introduces a table, and a loop tag between them. A longer run
  // moves to the next page whole and leaves most of a page empty before it.
  it.each(typesetFiles)('%s keeps at most three paragraphs in a row with the next', (name) => {
    const paragraphKeeps = keepingOf(name);
    let run = 0;
    let longest = 0;
    for (const block of blocksOf(name)) {
      run = paragraphKeeps(block) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThanOrEqual(3);
  });

  it.each(typesetFiles)('%s keeps a line ending in ":" with the list item after it', (name) => {
    const paragraphKeeps = keepingOf(name);
    const blocks = blocksOf(name);
    const stranded = blocks
      .filter(
        (block, index) =>
          !block.startsWith('<w:tbl>') &&
          documentTextOf(block).trim().endsWith(':') &&
          isListItem(blocks[index + 1] ?? '') &&
          !paragraphKeeps(block)
      )
      .map(documentTextOf);
    expect(stranded).toEqual([]);
  });

  it.each(decisionFiles)(
    '%s keeps a heading, what follows it, and its table on one page',
    (name) => {
      const heading = paragraphsOf(bodyOf(name)).find((paragraph) =>
        documentTextOf(paragraph).includes('PROCES-VERBAL DE LUARE LA CUNOȘTINȚĂ')
      );
      expect(heading).toMatch(/<w:keepNext(\/| w:val="true"\/)>/);
      // A table that may not split is written as rows that keep with the next one.
      const table = bodyOf(name).match(/<w:tbl>[\s\S]*?<\/w:tbl>/)![0];
      expect(table).toMatch(/<w:keepNext(\/| w:val="true"\/)>/);
    }
  );
});

// The editorial pass of `tools/import/wording.ro.json`: what the originals got wrong.
describe('wording', () => {
  const texts = typesetFiles.map((name) => [name, documentText(read(name))] as const);

  it.each(texts)(
    '%s uses comma-below letters, single spaces, no space before punctuation',
    (name, text) => {
      expect(text).not.toMatch(/[şţŞŢǎ]/);
      // The risk assessment writes its formulas as embedded objects, which leave gaps in the
      // extracted text where the page shows a formula.
      if (name.includes('risk_assessment')) return;
      expect(text).not.toMatch(/\S {2,}\S/);
      expect(text).not.toMatch(/\S[ \u00a0]+[,;:](\s|$)/m);
    }
  );

  // A Symbol font's private-use code points (an arrow, a degree sign) print as a gap in Arial.
  it.each(texts)('%s carries no private-use character', (_, text) => {
    expect(text).not.toMatch(/[\uE000-\uF8FF]/);
  });

  it.each(texts)("%s has none of the originals' typos or missing diacritics", (_, text) => {
    expect(text).not.toMatch(
      /instuirii|activitatatilor|deasemeni|deoparte|în tabelului|securitatii|sanatatii|(?<!\p{L})in munca(?!\p{L})|(?<!\p{L})si(?!\p{L})|functia|Subsemnat|laindemana|tinanduse|preventelor|contcteaza|cf\.deciziei|vor hotăra/u
    );
  });

  it.each(texts.filter(([name]) => name.includes('_decision_')))(
    '%s words the acknowledgement for one signer or several',
    (_, text) => {
      expect(text).toContain(
        'fiecare persoană desemnată confirmă că a luat cunoștință de prezenta decizie'
      );
    }
  );
});

describe('decision_first_aid', () => {
  const template = read('1.3_decision_first_aid.docx');
  const data = {
    branding: false,
    decisionNumber: 3,
    issueDate: '19.01.2026',
    client: {
      legalName: 'S.C. CLIENT DEMO S.R.L.',
      representativeName: 'Maria POPESCU',
      representativeRole: 'Director general',
    },
    provider: { legalName: 'S.C. SERVICIU EXTERN S.R.L.', representativeName: 'Ana IONESCU' },
    firstAiders: [
      { name: 'Ion MARIN', jobTitle: 'Manager magazin' },
      { name: 'Elena DUMITRU', jobTitle: 'Lucrător comercial' },
    ],
    firstAiderNames: 'Ion MARIN, Elena DUMITRU',
  };

  it('asks for exactly this data', () => {
    expect(templatePlaceholders(template)).toEqual([
      'branding',
      'client.legalName',
      'client.representativeName',
      'client.representativeRole',
      'decisionNumber',
      'firstAiderNames',
      'firstAiders',
      'issueDate',
      'jobTitle',
      'name',
      'provider.legalName',
      'provider.representativeName',
    ]);
  });

  it('names every first aider in the decision and in both tables, without honorifics', () => {
    const text = documentText(renderDocument(template, data));

    expect(text).not.toContain('{{');
    expect(text).toContain('Nr. 3 SSM din 19.01.2026');
    expect(text).toContain(
      'Maria POPESCU, în calitate de Director general în cadrul S.C. CLIENT DEMO S.R.L.'
    );
    expect(text).toContain(
      'Elena DUMITRU, având funcția de Lucrător comercial în cadrul S.C. CLIENT DEMO S.R.L., pentru toate locurile de muncă ale unității.'
    );
    // Once in the decision, once in each of the two acknowledgement tables.
    expect(text.match(/Ion MARIN/g)).toHaveLength(4);
    expect(text.match(/^Lucrător comercial$/gm)).toHaveLength(2);
    expect(text).toContain('S.C. SERVICIU EXTERN S.R.L. – Ana IONESCU');
    // Reads the same for one first aider or several.
    expect(text).toContain(
      'a personalului desemnat să acorde primul ajutor: Ion MARIN, Elena DUMITRU.'
    );
    expect(text).toContain('Personalul desemnat prin prezenta decizie va fi instruit suplimentar');
  });

  it('refuses to render without a first aider name list rather than leave a gap', () => {
    const incomplete = { ...data, firstAiderNames: undefined };
    expect(() => renderDocument(template, incomplete)).toThrow(/firstAiderNames/);
  });
});

const people = [
  { name: 'Ion MARIN', jobTitle: 'Manager magazin' },
  { name: 'Elena DUMITRU', jobTitle: 'Lucrător comercial' },
];
const described = (list: typeof people) =>
  list.map((person) => `${person.name}, având funcția de ${person.jobTitle}`).join(', și ');
const shared = {
  branding: false,
  issueDate: '19.01.2026',
  client: {
    legalName: 'S.C. CLIENT DEMO S.R.L.',
    representativeName: 'Maria POPESCU',
    representativeRole: 'Director general',
  },
  provider: { legalName: 'S.C. SERVICIU EXTERN S.R.L.', representativeName: 'Ana IONESCU' },
};
const acknowledged = (text: string) =>
  expect(text.match(/^Lucrător comercial$/gm), 'one table row per person').toHaveLength(1);

describe('decision_training', () => {
  const template = read('1.1_decision_training.docx');
  const data = {
    ...shared,
    decisionNumber: 1,
    workplaceManagers: people,
    workplaceManagersText: described(people),
    training: {
      periodicDuration: '2 ore',
      intervalPhrase: 'următoarele intervale de timp',
      administrative: true,
      worker: true,
      administrativeFrequency: 'SEMESTRIAL',
      administrativeMonths: 'lunile februarie și august',
      workerFrequency: 'ANUAL',
      workerMonths: 'luna februarie',
      dayFrom: 2,
      dayTo: 7,
    },
  };

  it('prints the training schedule, and names the workplace managers once as those who train the execution staff', () => {
    const text = documentText(renderDocument(template, data));

    expect(text).not.toContain('{{');
    expect(text).toContain('durata instruirii periodice va fi de 2 ore');
    // The original closes this sentence with the client's name and a full stop of its own.
    expect(text).toContain('din cadrul S.C. CLIENT DEMO S.R.L.\n');
    expect(text).not.toContain('..');
    expect(text).toContain(
      'șefii de locuri de muncă vor fi instruiți SEMESTRIAL, respectiv în lunile februarie și august, în perioada (zilele) 2 – 7 ale lunii'
    );
    expect(text).toContain(
      'va fi instruit ANUAL, respectiv în luna februarie, în perioada (zilele) 2 – 7 ale lunii'
    );
    expect(text).toContain(
      'pentru personalul de conducere al locurilor de muncă din cadrul S.C. CLIENT DEMO S.R.L. și pentru personalul tehnico-administrativ. Personalul de conducere al locurilor de muncă: Ion MARIN, având funcția de Manager magazin în cadrul unității; Elena DUMITRU,'
    );
    expect(text).toContain(
      'Personalul de conducere al locurilor de muncă – Ion MARIN, având funcția de Manager magazin, și Elena DUMITRU, având funcția de Lucrător comercial – va efectua instruirea la locul de muncă și instruirea periodică pentru personalul de execuție din cadrul S.C. CLIENT DEMO S.R.L.'
    );
    expect(text.match(/pentru personalul de execuție/g)).toHaveLength(1);
    acknowledged(text);
  });

  it('carries none of the colours the provider marked text with', () => {
    const xml = new PizZip(template).file('word/document.xml')!.asText();
    expect(xml).not.toMatch(/w:color w:val="(FF0000|92D050)"/);
  });

  it('prints only the confirmed category paragraphs', () => {
    const administrativeOnly = documentText(
      renderDocument(template, {
        ...data,
        training: {
          ...data.training,
          intervalPhrase: 'următorul interval de timp',
          worker: false,
          workerFrequency: undefined,
          workerMonths: undefined,
        },
      })
    );
    expect(administrativeOnly).toContain('vor fi instruiți SEMESTRIAL');
    expect(administrativeOnly).toContain('următorul interval de timp');
    expect(administrativeOnly).not.toContain('personalul de execuție va fi instruit');

    const workerOnly = documentText(
      renderDocument(template, {
        ...data,
        training: {
          ...data.training,
          intervalPhrase: 'următorul interval de timp',
          administrative: false,
          administrativeFrequency: undefined,
          administrativeMonths: undefined,
        },
      })
    );
    expect(workerOnly).toContain('va fi instruit ANUAL');
    expect(workerOnly).toContain(
      'instruirea periodică pentru personalul de conducere al locurilor de muncă din cadrul'
    );
    expect(workerOnly).not.toContain(
      'personalul tehnico-administrativ și șefii de locuri de muncă vor fi instruiți'
    );
  });

  it('refuses to render without the training schedule', () => {
    expect(() => renderDocument(template, { ...data, training: undefined })).toThrow(
      /training\.periodicDuration/
    );
  });
});

describe('decision_risk_evaluation_team', () => {
  it("names the team and the provider's specialist with their title", () => {
    const text = documentText(
      renderDocument(read('1.2_decision_risk_evaluation_team.docx'), {
        ...shared,
        decisionNumber: 2,
        evaluationTeam: people,
        specialist: { name: 'Ana IONESCU', professionalTitle: 'Evaluator de risc SSM' },
      })
    );

    expect(text).not.toContain('{{');
    expect(text).toContain('Nr. 2 SSM din 19.01.2026');
    expect(text.match(/va îndeplini și funcția de membru al echipei de evaluare/g)).toHaveLength(2);
    expect(text).toContain(
      'Ana IONESCU, în calitate de Evaluator de risc SSM din cadrul S.C. SERVICIU EXTERN S.R.L., va coordona'
    );
    acknowledged(text);
  });
});

describe('decision_imminent_danger', () => {
  const render = (
    managers: typeof people,
    wording: 'assume' | 'assume_and_designate' | 'designate_alongside' | 'assign' | 'designate',
    others: typeof people | null = null,
    managerNames: string | null = null
  ) =>
    documentText(
      renderDocument(read('1.4_decision_imminent_danger.docx'), {
        ...shared,
        decisionNumber: 4,
        workplaceManagersText: described(managers),
        imminentDanger: people,
        imminentDangerText: described(people),
        workplaceManagersAssumeImminentDanger: wording === 'assume',
        workplaceManagersAssumeAndDesignateImminentDanger: wording === 'assume_and_designate',
        workplaceManagersDesignateAlongsideImminentDanger: wording === 'designate_alongside',
        workplaceManagersAssignImminentDanger: wording === 'assign',
        workplaceManagersDesignateImminentDanger: wording === 'designate',
        imminentDangerOthersText: others && described(others),
        imminentDangerManagerNames: managerNames,
      })
    );
  const lead = 'conducerea locurilor de muncă din cadrul S.C. CLIENT DEMO S.R.L. – ';

  it('names the designated people in each of the five measures', () => {
    const manager = [{ name: 'Ana POP', jobTitle: 'Șef sală' }];
    const text = render(manager, 'designate');

    expect(text).not.toContain('{{');
    expect(text).toContain(
      `${lead}Ana POP, având funcția de Șef sală – desemnează pe ${described(people)}, cu următoarele atribuții:`
    );
    // Named once; each of the five measures then refers to them.
    expect(text.split(described(people))).toHaveLength(2);
    expect(text).not.toContain('în calitate de Manager magazin');
    // Worded for one designated person or several.
    expect(text.match(/: personalul desemnat/g)).toHaveLength(5);
    expect(text).toContain('Personalul desemnat va primi de asemenea');
    expect(text).not.toMatch(/lucrătorii desemnați/i);
    acknowledged(text);
  });

  it('lets the workplace managers take the duties on when they are the ones designated', () => {
    const text = render(people, 'assume');

    expect(text).toContain(
      `${lead}${described(people)} – își asumă, în calitate de personal desemnat, următoarele atribuții:`
    );
    expect(text.split(described(people))).toHaveLength(2);
    expect(text).not.toContain('desemnează pe');
    acknowledged(text);
  });

  it('lets the workplace managers take the duties on and designate the others beside them', () => {
    const text = render(people.slice(0, 1), 'assume_and_designate', people.slice(1));

    expect(text).not.toContain('{{');
    expect(text).toContain(
      `${lead}Ion MARIN, având funcția de Manager magazin – își asumă rolul de personal desemnat și desemnează pe Elena DUMITRU, având funcția de Lucrător comercial, cu următoarele atribuții:`
    );
    expect(text.match(/desemnează pe/g)).toHaveLength(1);
    expect(text.match(/Ion MARIN/g)).toHaveLength(2);
    acknowledged(text);
  });

  const manager = { name: 'Ana POP', jobTitle: 'Șef sală' };

  it('lets a designated manager take the role on beside the people the managers designate', () => {
    const text = render([people[0]!, manager], 'designate_alongside', people.slice(1), 'Ion MARIN');

    expect(text).not.toContain('{{');
    expect(text).toContain(
      `${lead}${described([people[0]!, manager])} – desemnează pe Elena DUMITRU, având funcția de Lucrător comercial, alături de Ion MARIN, care își asumă rolul de personal desemnat, cu următoarele atribuții:`
    );
    expect(text.match(/desemnează pe/g)).toHaveLength(1);
    expect(text).not.toContain('Ion MARIN, având funcția de Manager magazin, și Elena');
    acknowledged(text);
  });

  it('settles which managers take the duties on when nobody else is designated', () => {
    const text = render([people[0]!, manager], 'assign', null, 'Ion MARIN');

    expect(text).not.toContain('{{');
    expect(text).toContain(
      `${lead}${described([people[0]!, manager])} – stabilește ca Ion MARIN să își asume, în calitate de personal desemnat, următoarele atribuții:`
    );
    expect(text).not.toContain('desemnează pe');
    acknowledged(text);
  });
});

describe('decision_workers_representative', () => {
  const template = read('1.5_decision_workers_representative.docx');
  const render = (workersRepresentatives: typeof people) =>
    documentText(
      renderDocument(template, {
        ...shared,
        decisionNumber: 5,
        workersRepresentatives,
        workersRepresentativesLead:
          workersRepresentatives.length === 1 ? 'următorul angajat' : 'următorii angajați',
      })
    );

  it('designates each representative once, and lists them in the table', () => {
    const text = render(people);
    expect(text).not.toContain('{{');
    expect(text).toContain('Nr. 5 SSM din 19.01.2026');
    expect(text).toContain(
      'Maria POPESCU, având funcția de Director general în cadrul S.C. CLIENT DEMO S.R.L., începând cu data de 19.01.2026, desemnează'
    );
    expect(text).toMatch(
      /pe următorii angajați:\s+Ion MARIN, având funcția de Manager magazin\.\s+Elena DUMITRU, având funcția de Lucrător comercial\./
    );
    expect(text).not.toMatch(/funcția de [^\n]*;/);
    acknowledged(text);
  });

  it('speaks of one employee when there is one', () => {
    expect(render([people[0]!])).toContain('pe următorul angajat:');
  });

  it('prints the thresholds of H.G. 1425/2006 art. 53(2) as minimums', () => {
    const text = render(people);
    expect(text).toContain('cel puțin un reprezentant, în cazul în care');
    expect(text).toContain('va avea între 10 și 49 de lucrători inclusiv');
    expect(text).toContain('cel puțin doi reprezentanți, în cazul în care');
    expect(text).toContain('va avea între 50 și 100 de lucrători inclusiv');
  });

  it('says who elects the representatives in a sentence that reads', () => {
    const text = render(people);
    expect(text).toContain(
      'Reprezentanții lucrătorilor cu răspunderi specifice în domeniul securității și sănătății în muncă sunt aleși de către și dintre lucrătorii'
    );
    expect(text).not.toContain('Numirea reprezentanților');
  });
});

describe('employer_briefing', () => {
  const template = read('11_employer_briefing.docx');

  it("prints the client's periodic training duration from the field decision 1.1 prints", () => {
    expect(templatePlaceholders(template)).toContain('training.periodicDuration');
    const text = documentText(
      renderDocument(template, {
        ...shared,
        provider: { ...shared.provider, representativeRole: 'Administrator' },
        workersRepresentativeDecision: false,
        training: { periodicDuration: '1 oră și 30 de minute' },
      })
    );
    expect(text).toContain(
      'Instruirea periodică durează 1 oră și 30 de minute și are periodicitatea stabilită prin programul de instruire-testare și prin instrucțiunile proprii ale unității.'
    );
    expect(text).not.toContain('1,30 ore');
  });
});

describe('cover_decisions', () => {
  const template = read('1.0_cover_decisions.docx');
  const render = (workersRepresentativeDecision: boolean) =>
    documentText(
      renderDocument(template, {
        ...shared,
        provider: { ...shared.provider, representativeRole: 'Administrator' },
        workersRepresentativeDecision,
      })
    );

  it('lists decision 1.5 only when it is part of the set', () => {
    expect(render(true)).toContain('5. Desemnarea reprezentanților lucrătorilor');
    const without = render(false);
    expect(without).not.toContain('Desemnarea reprezentanților');
    expect(without).toContain('grav și iminent.');
  });
});

describe('annex title page', () => {
  const template = annexTitlePage();
  const data = {
    ...shared,
    provider: { ...shared.provider, representativeRole: 'Administrator' },
    number: 2,
    title: 'Scări metalice',
    versionDate: '26.09.2026',
  };
  const headerText = (file: Uint8Array) => {
    const zip = new PizZip(file);
    return Object.keys(zip.files)
      .filter((part) => /word\/header\d*\.xml/.test(part))
      .map((part) => documentTextOf(zip.file(part)!.asText()));
  };

  it('asks for the header of the own instructions and the annex', () => {
    expect(templatePlaceholders(template)).toEqual([
      'branding',
      'client.legalName',
      'client.representativeName',
      'client.representativeRole',
      'issueDate',
      'number',
      'provider.legalName',
      'provider.representativeName',
      'provider.representativeRole',
      'title',
      'versionDate',
    ]);
  });

  it('names the annex in the body and where the common part numbers its pages', () => {
    const merged = renderDocument(template, data);
    const body = new PizZip(merged).file('word/document.xml')!.asText();
    expect((body.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map(documentTextOf)).toEqual([
      'ANEXA 2',
      'la Instrucțiunile proprii în domeniul securității și sănătății în muncă',
      'I.P.S.S.M. Scări metalice',
      'versiunea din 26.09.2026',
    ]);
    for (const text of headerText(merged)) {
      expect(text).toContain('Cod document:IPSSM');
      expect(text).toContain(
        'Denumire document:Instrucțiuni proprii în domeniul securității și sănătății în muncă'
      );
      expect(text).toMatch(/Anexa 2$/);
      expect(text).not.toContain('Pag.');
    }
  });

  it('carries the same box of document details as the common part', () => {
    const cells = (file: Uint8Array) =>
      headerText(file)[0]!.replace(/Pag\. .*$|Anexa \{\{number\}\}$/, '');
    expect(cells(template)).toBe(cells(read('3.2_own_instructions.docx')));
  });

  it('refuses to render without the annex it introduces', () => {
    expect(() => renderDocument(template, { ...data, versionDate: undefined })).toThrow(
      /versionDate/
    );
  });
});

describe('branding', () => {
  const template = read('1.2_decision_risk_evaluation_team.docx');
  const data = {
    ...shared,
    decisionNumber: 2,
    evaluationTeam: people,
    specialist: { name: 'Ana IONESCU', professionalTitle: 'Evaluator de risc SSM' },
  };
  const footerText = (file: Uint8Array) => {
    const zip = new PizZip(file);
    return Object.keys(zip.files)
      .filter((part) => /word\/footer\d*\.xml/.test(part))
      .map((part) => documentTextOf(zip.file(part)!.asText()));
  };

  it('prints the line in the footer when the merge data asks for it', () => {
    const footers = footerText(renderDocument(template, { ...data, branding: true }));
    expect(new Set(footers)).toEqual(new Set(['Document generat cu SSM Ușor · ssmusor.ro']));
  });

  it('prints nothing when branding is false, and refuses data without it', () => {
    expect(new Set(footerText(renderDocument(template, { ...data, branding: false })))).toEqual(
      new Set([''])
    );
    expect(() => renderDocument(template, { ...data, branding: undefined })).toThrow(/branding/);
  });

  const brandingParagraphs = (name: string) => {
    const zip = new PizZip(read(name));
    return Object.keys(zip.files)
      .filter((part) => /word\/footer\d*\.xml/.test(part))
      .flatMap(
        (part) =>
          zip
            .file(part)!
            .asText()
            .match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []
      )
      .filter((paragraph) => documentTextOf(paragraph).includes('{{#branding}}'));
  };

  // The own instructions' PDF puts an annex title page after its pages: the line must not move.
  it.each(typesetFiles)('%s centres the line on the width of the text', (name) => {
    const paragraphs = brandingParagraphs(name);
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const paragraph of paragraphs) {
      expect(paragraph).toContain('<w:jc w:val="center"/>');
      expect(paragraph).not.toMatch(/<w:ind [^>]*w:(right|end)="[1-9]/);
    }
  });

  it.each(typesetFiles)('%s sets the line in 7.5 pt grey', (name) => {
    const runs = brandingParagraphs(name)
      .flatMap((paragraph) => paragraph.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? [])
      .filter((run) => run.includes('<w:t'));
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(run).toContain('<w:sz w:val="15"/>');
      expect(run).toContain('<w:color w:val="7A7A7A"/>');
    }
  });
});

// ADR 014: the two plans are static text, and their article ranges fall on the chapters of the
// 2.2 and 3.2 templates.
describe('training_themes', () => {
  const lines = documentText(read('4.2_training_themes.docx')).split('\n');

  it('cites the general training material chapter by chapter, 2.2 as it is numbered', () => {
    expect(lines.filter((line) => line.startsWith('MISSMIG Art.'))).toEqual([
      ...[
        [1, 6],
        [7, 13],
        [14, 15],
        [16, 27],
        [28, 80],
        [81, 96],
        [97, 108],
        [109, 120],
        [121, 151],
        [152, 210],
        [211, 235],
        [236, 267],
        [268, 277],
        [278, 290],
        [291, 299],
        [300, 324],
      ].map(([from, to]) => `MISSMIG Art. ${from} – ${to}`),
      'MISSMIG Art. 325',
    ]);
  });

  it('cites the common part of the own instructions chapter by chapter', () => {
    expect(lines.filter((line) => line.startsWith('I.P.S.S.M. Art.'))).toEqual(
      [
        [1, 9],
        [10, 44],
        [45, 46],
        [47, 56],
        [57, 63],
        [64, 95],
        [96, 159],
        [160, 179],
        [180, 194],
        [195, 235],
        [236, 255],
        [256, 290],
      ].map(([from, to]) => `I.P.S.S.M. Art. ${from} – ${to}`)
    );
  });

  it('repeats a block per position, a row per session and a citation per module', () => {
    const placeholders = templatePlaceholders(read('4.2_training_themes.docx'));
    expect(placeholders).toEqual(
      expect.arrayContaining(['themes.positions', 'sessions', 'modules', 'themes.annexTitles'])
    );
    const text = lines.join('\n');
    expect(text.match(/\{\{#themes\.positions\}\}/g)).toHaveLength(2);
    expect(text).toContain('{{#sessions}}{{month}}');
    expect(text).toContain(
      'I.P.S.S.M. Art.\u00a01\u00a0–\u00a0290; {{#modules}}{{citation}}; {{/modules}}'
    );
  });

  it('adds the minutes of every row of a plan, breaks included, up to the total it prints', () => {
    const cellsOf = (row: string) =>
      (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(documentTextOf);
    const plans = (bodyOf('4.2_training_themes.docx').match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [])
      .map((table) => (table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map(cellsOf))
      .filter((rows) => rows.some((cells) => cells.includes('TIMP TOTAL DE INSTRUIRE')));
    expect(plans).toHaveLength(2);
    for (const rows of plans) {
      const minutes = (cells: string[]) => Number(/^(\d+) min$/.exec(cells.at(-1)!)?.[1] ?? 0);
      const total = rows.find((cells) => cells.includes('TIMP TOTAL DE INSTRUIRE'))!;
      const sum = rows
        .filter((cells) => cells !== total)
        .reduce((minutesSoFar, cells) => minutesSoFar + minutes(cells), 0);
      expect(sum).toBe(minutes(total));
      expect(sum).toBe(240);
    }
  });

  it('labels the trainer without saying who it is, since the provider trains some posts', () => {
    const text = lines.join('\n');
    expect(text.match(/CINE EFECTUEAZĂ INSTRUIREA: /g)).toHaveLength(3);
    expect(text).not.toContain('ȘEF DIRECT');
  });
});

describe('risk_assessment', () => {
  const text = documentText(read('9_risk_assessment.docx'));

  it("prints nothing of the first client's posts, levels or premises", () => {
    expect(text).not.toMatch(
      /MANAGER MAGAZIN|Manager magazin|GELATERIE|BARMAN|VIZITATOR|5630|Calea Victoriei|Vestiarele|Stingător P6|2,40|2,55/
    );
  });

  it('repeats a subchapter per evaluation, and a contents row for each', () => {
    expect(templatePlaceholders(read('9_risk_assessment.docx'))).toEqual(
      expect.arrayContaining([
        'riskAssessment.evaluations',
        'components',
        'groups',
        'factors',
        'sheet',
        'unacceptable',
        'plan',
        'ranked',
        'riskAssessment.globalLevel',
        'workersRepresentatives',
      ])
    );
    expect(text.match(/\{\{#riskAssessment\.evaluations\}\}/g)).toHaveLength(3);
    expect(text).toContain('{{#sheet}}{{component}}');
    expect(text).toContain('Conducerea locurilor de muncă: {{workplaceManagersList}}');
    expect(text).toContain('SUBCAPITOLUL V.{{roman}}.');
    expect(text).not.toMatch(/\d+ – \d+\s*(I|II|III|IV|V|VI)\b/);
  });

  it('lists every factor with a measure in the measures sheet, as the plan does', () => {
    const sheet = text.slice(
      text.indexOf('IV. FIȘA DE MĂSURI PROPUSE'),
      text.indexOf('V. INTERPRETAREA REZULTATELOR EVALUĂRII')
    );
    expect(sheet).toContain('{{#plan}}{{$index}}.');
    expect(sheet).toContain('{{measures}}{{/plan}}');
    expect(sheet).toContain('{{#noPlan}}');
    expect(sheet).not.toContain('nacceptable}}');
  });

  it('says when the assessment is reviewed, in the words of H.G. 1425/2006', () => {
    expect(text).toContain(
      'ori de câte ori intervin modificări ale condițiilor de muncă, respectiv la apariția unor riscuri noi și în urma producerii unui eveniment'
    );
  });
});

describe('prevention_plan', () => {
  const text = documentText(read('10_prevention_plan.docx'));

  it("prints nothing of the first client's posts or measures", () => {
    expect(text).not.toMatch(
      /MANAGER MAGAZIN|GELATERIE|BARMAN|VIZITATOR|P\.R\.A\.M\.|Cond\. loc muncă|Periodic/
    );
  });

  it('repeats a table of the columns of annex 7 per evaluation, or a sentence without measures', () => {
    expect(text.match(/\{\{#riskAssessment\.evaluations\}\}/g)).toHaveLength(1);
    expect(text).toContain('{{#plan}}{{$index}}.');
    expect(text).toContain('{{#noPlan}}');
    for (const column of [
      'Riscuri evaluate',
      'Măsuri tehnice',
      'Măsuri organizatorice',
      'Măsuri igienico-sanitare',
      'Măsuri de altă natură',
      'Acțiuni în scopul realizării măsurii',
      'Termen de realizare',
      'Persoana care răspunde de realizarea măsurii',
      'Observații',
    ]) {
      expect(text).toContain(column);
    }
  });
});
