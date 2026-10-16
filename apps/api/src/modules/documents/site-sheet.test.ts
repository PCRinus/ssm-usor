import { describe, expect, it } from 'vitest';

import type { DocumentFacts } from './context';
import { facts, officeId, workshopId } from './context.fixture';
import { buildFireSafetyContext } from './fire-safety';
import type { SiteSheetRow } from './site-sheet';

const sheetOf = (variant: Partial<DocumentFacts> = {}) =>
  buildFireSafetyContext({ ...facts, currentEmployeeCount: 12, ...variant }).fire.siteSheet;

const valueOf = (rows: SiteSheetRow[], title: string) => {
  const found = rows.find((row) => row.title === title);
  if (!found) throw new Error(`No row ${title}`);
  return found.value;
};

const withFire = (fireSafety: Partial<DocumentFacts['fireSafety']>): Partial<DocumentFacts> => ({
  fireSafety: { ...facts.fireSafety, ...fireSafety },
});

const technician =
  'Cadru tehnic cu atribuții în domeniul apărării împotriva incendiilor/Inspector de protecție civilă';

describe('the site sheet', () => {
  it('names the operator, its administrator, its points of work and the technician', () => {
    const { identity } = sheetOf();
    expect(valueOf(identity, 'Denumirea operatorului economic/instituției')).toBe(
      'S.C. PIPETECH S.R.L.'
    );
    expect(valueOf(identity, 'Administrator/Conducător – date de identificare')).toBe(
      'Florin Cristian TALOȘ, administrator'
    );
    expect(valueOf(identity, 'Administrator/Conducător – telefon serviciu')).toBe('0722 111 222');
    expect(valueOf(identity, 'Administrator/Conducător – telefon domiciliu')).toBeNull();
    expect(valueOf(identity, 'Coordonatele operatorului economic/instituției – adresa')).toBe(
      'Timișoara, județul Timiș, Str. Gheorghe Lazăr 24'
    );
    expect(
      valueOf(identity, 'Coordonatele operatorului economic/instituției – telefon, fax, e-mail')
    ).toBe('telefon: 0722 111 222, e-mail: office@pipetech.ro');
    expect(
      valueOf(identity, 'Coordonatele filialelor/sucursalelor/punctelor de lucru (dacă este cazul)')
    ).toBe(
      '– Atelier Ghiroda: Ghiroda, județul Timiș, Str. Industriilor 4\nTelefon, fax, e-mail pentru fiecare: DE COMPLETAT'
    );
    expect(valueOf(identity, 'Număr de înregistrare din registrul comerțului')).toBe(
      'J35/1234/2008, CUI 14399840'
    );
    expect(valueOf(identity, `${technician} – nume și prenume`)).toBe(
      'Radu STAN, reprezentant al S.C. SERVICIU EXTERN DEMO S.R.L.'
    );
    expect(valueOf(identity, `${technician} – telefon serviciu`)).toBe('0256 123 456');
    expect(
      valueOf(identity, `${technician} – certificat de competență, termen de valabilitate`)
    ).toBe('CT 1234/2024; termen de valabilitate: DE COMPLETAT');
  });

  it('lists no point of work for a client that works only at its registered office', () => {
    const { identity } = sheetOf({
      workplaces: facts.workplaces.filter((workplace) => workplace.registeredOffice),
    });
    expect(
      valueOf(identity, 'Coordonatele filialelor/sucursalelor/punctelor de lucru (dacă este cazul)')
    ).toBe('nu este cazul');
  });

  it("leaves the administrator's phone to fill in when the contact is someone else", () => {
    const { identity } = sheetOf({
      client: { ...facts.client, contactName: 'Ana CONTABIL', tradeRegisterNumber: null },
    });
    expect(valueOf(identity, 'Administrator/Conducător – telefon serviciu')).toBeNull();
    expect(valueOf(identity, 'Număr de înregistrare din registrul comerțului')).toBe(
      'CUI 14399840'
    );
  });

  it('gives each general fact per building, the registered office first, a gap for a building that has none', () => {
    const { general } = sheetOf();
    expect(valueOf(general, 'Anul de construire (punere în funcțiune)')).toBe(
      'Clădirea 1 (Sediul social): DE COMPLETAT\nClădirea 2 (Atelier Ghiroda): 1987'
    );
    expect(valueOf(general, 'Suprafața construită/desfășurată')).toBe(
      'Clădirea 1 (Sediul social): DE COMPLETAT\nClădirea 2 (Atelier Ghiroda): 412,5\u00a0m²'
    );
    expect(
      valueOf(
        general,
        'Clasificare construcție (civilă, de producție, de depozitare, cu funcțiuni mixte)'
      )
    ).toBe('Clădirea 1 (Sediul social): DE COMPLETAT\nClădirea 2 (Atelier Ghiroda): de producție');
    expect(valueOf(general, 'Domeniul de activitate')).toBe(
      'Birouri; Atelier de sudură; cod CAEN 2562'
    );
    expect(valueOf(general, 'Personal angajat')).toBe(
      '12 angajați în total; numărul estimativ pe fiecare clădire: DE COMPLETAT'
    );
    expect(valueOf(general, 'Utilizarea clădirii')).toBeNull();
  });

  it('prints one building plainly, and a gap where no building has the fact', () => {
    const { general } = sheetOf({ workplaces: [facts.workplaces[0]!] });
    expect(valueOf(general, 'Anul de construire (punere în funcțiune)')).toBe('1987');
    const empty = sheetOf(withFire({ buildings: [] }));
    expect(valueOf(empty.general, 'Anul de construire (punere în funcțiune)')).toBeNull();
  });

  it('has a building per fixed space, and none for a mobile site, whatever it kept', () => {
    const mobile = { ...facts.workplaces[0]!, kind: 'mobile_site' as const };
    const sheet = sheetOf({ workplaces: [mobile, facts.workplaces[1]!] });
    expect(sheet.buildings.map((building) => building.name)).toEqual(['Sediul social']);
    expect(valueOf(sheet.general, 'Anul de construire (punere în funcțiune)')).toBeNull();
    expect(
      valueOf(
        sheet.identity,
        'Coordonatele filialelor/sucursalelor/punctelor de lucru (dacă este cazul)'
      )
    ).toContain('– Atelier Ghiroda (șantier temporar sau mobil): Ghiroda');

    const sites = sheetOf({ workplaces: [mobile] });
    expect(sites.buildings).toEqual([]);
    expect(sites.noBuildings).toBe(true);
    expect(valueOf(sites.general, 'Suprafața construită/desfășurată')).toBe(
      'nu este cazul: activitatea se desfășoară numai în puncte de lucru temporare sau mobile'
    );
  });

  it("fills a building's technical rows from its block and the inventory, and the rest as gaps", () => {
    const [office, workshop] = sheetOf().buildings;
    expect(workshop!.place).toBe('Atelier Ghiroda, Ghiroda, județul Timiș, Str. Industriilor 4');
    expect(workshop!.constructive.every((row) => row.value === null && row.hint)).toBe(true);
    expect(valueOf(workshop!.technical, 'Sisteme de încălzire')).toBe(
      'combustibil: gaze naturale; întreținerea și ultima verificare: DE COMPLETAT'
    );
    expect(valueOf(workshop!.technical, 'Instalații electrice')).toBe(
      'întreținute de S.C. ELECTRO SERV S.R.L.; ultima verificare: 12.03.2026'
    );
    expect(valueOf(workshop!.technical, 'Instalație de alimentare cu gaze naturale/G.P.L.')).toBe(
      'există; utilizare: încălzire și apă caldă'
    );
    expect(valueOf(workshop!.technical, 'Sisteme și instalații tehnologice')).toBe(
      'Aparate de sudură, polizoare unghiulare'
    );
    expect(valueOf(workshop!.technical, 'Sisteme de detectare a incendiilor')).toBe('nu există');
    expect(valueOf(workshop!.technical, 'Sisteme de alarmare/avertizare')).toBeNull();
    expect(valueOf(workshop!.technical, 'Hidranți exteriori')).toBe(
      'există; doi hidranți în curte'
    );
    expect(valueOf(workshop!.technical, 'Stingătoare')).toBe(
      'P6 – 2\u00a0buc., P50 carosabil – 1\u00a0buc., G5 – 1\u00a0buc.; verificate de S.C. FOC STOP S.R.L.'
    );
    expect(
      valueOf(
        workshop!.technical,
        'Alimentarea cu apă pentru stingerea incendiilor (rezerva de apă, pompe)'
      )
    ).toBe('nu există o rezervă proprie de apă pentru stingerea incendiilor');
    expect(valueOf(workshop!.technical, 'Alte precizări')).toBe(
      'Hala are o singură ieșire spre curte.'
    );

    expect(valueOf(office!.technical, 'Instalații electrice')).toBeNull();
    expect(valueOf(office!.technical, 'Sisteme de detectare a incendiilor')).toBe(
      'există; firma de service: S.C. ALARM SERVICE S.R.L.; ultima verificare: 12.03.2026'
    );
    expect(valueOf(office!.technical, 'Sisteme de alarmare/avertizare')).toBe(
      'prin instalația de detectare, semnalizare și avertizare la incendiu; tipul avertizării: DE COMPLETAT'
    );
    expect(valueOf(office!.technical, 'Stingătoare')).toBe(
      'SM9 – 1\u00a0buc.; firma atestată care le verifică: DE COMPLETAT'
    );
    expect(office!.technical.some((row) => row.title === 'Alte precizări')).toBe(false);
  });

  it('marks the half of the electrical facts that is missing', () => {
    const [building] = facts.fireSafety.buildings;
    const [, workshop] = sheetOf(
      withFire({ buildings: [{ ...building!, electricalMaintainer: null }] })
    ).buildings;
    expect(valueOf(workshop!.technical, 'Instalații electrice')).toBe(
      'firma care le întreține: DE COMPLETAT; ultima verificare: 12.03.2026'
    );
  });

  it('lists each dangerous substance with its storage and handling, or declares none', () => {
    const { substances } = sheetOf();
    expect(substances.listed).toBe(true);
    expect(substances.entries.map((entry) => entry.name)).toEqual([
      'Propan',
      'Diluant pentru vopsele',
    ]);
    expect(substances.entries[0]!.rows.map((row) => row.value)).toEqual([
      'Propan – Flam. Gas 1, H220; Press. Gas, H280',
      '2 butelii de 11 kg',
      'Cușca metalică ventilată din curte',
      null,
    ]);
    const none = sheetOf(withFire({ substances: { state: 'none', entries: [] } })).substances;
    expect(none).toEqual({ none: true, listed: false, entries: [] });
  });

  it("states the organization from the decisions, and the control decision's intervals from ten employees", () => {
    const { organization } = sheetOf();
    expect(valueOf(organization, 'Instruirea personalului')).toBe(
      'da, potrivit Deciziei nr.\u00a06 PSI: personalul administrativ este instruit periodic la 6 luni, câte 2 ore, de cadrul tehnic PSI, Radu STAN, titular al certificatului CT 1234/2024; personalul de execuție este instruit periodic la 3 luni, câte 2 ore, de conducătorii locurilor de muncă (Florin Cristian TALOȘ și Ioana PETRE), cu cadrul tehnic, după caz'
    );
    expect(valueOf(organization, 'Control intern de prevenire')).toMatch(
      /^da, potrivit Deciziei nr.\u00a013 PSI: coordonatorul privind apărarea împotriva incendiilor, Florin Cristian TALOȘ, și cadrul tehnic – trimestrial/
    );
    expect(valueOf(organization, 'Serviciu privat pentru situații de urgență')).toBe(
      'nu este cazul'
    );
    expect(valueOf(organization, 'Planuri/exerciții de evacuare din clădire')).toBeNull();
    expect(valueOf(organization, 'Afișare instrucțiuni specifice')).toContain(
      'Decizia nr.\u00a010 PSI'
    );
    expect(valueOf(organization, 'Ordinea interioară')).toBe(
      'reglementată prin Decizia nr.\u00a07 PSI privind lucrul cu foc deschis, Decizia nr.\u00a08 PSI privind fumatul, Decizia nr.\u00a011 PSI privind colectarea deșeurilor și Decizia nr.\u00a012 PSI privind perioadele caniculare și sezonul rece; asigurarea căilor de acces, de evacuare și de intervenție: DE COMPLETAT'
    );
    const documents = valueOf(organization, 'Documente specifice de apărare împotriva incendiilor');
    expect(documents!.split('\n')).toHaveLength(21);
    expect(documents).toContain('– Decizia nr.\u00a013 PSI privind controlul propriu');
    expect(documents).toContain('– Instrucțiuni proprii în domeniul situațiilor de urgență\n');
    expect(documents).toContain('– Test la angajare\n– Test anual\n');
    expect(documents).toContain('– Registru de evidență a controlului stingătoarelor de incendiu');
    expect(
      valueOf(
        organization,
        'Reglementarea modului de întreținere, verificare, reparare a mijloacelor tehnice de apărare împotriva incendiilor'
      )
    ).toBe(
      '– stingătoarele: S.C. FOC STOP S.R.L.\n– hidranți exteriori: DE COMPLETAT\n– instalație de detectare, semnalizare și avertizare la incendiu: S.C. ALARM SERVICE S.R.L.\n– hidranți interiori: DE COMPLETAT\nVerificările se fac după graficele de întreținere și verificare.'
    );
  });

  it('names the one workplace manager who trains the execution staff in the singular', () => {
    const [administrator, leader] = facts.responsiblePersons;
    const { organization } = sheetOf({
      responsiblePersons: [
        administrator!,
        { ...leader!, roles: leader!.roles.filter((role) => role !== 'workplace_manager') },
      ],
    });
    expect(valueOf(organization, 'Instruirea personalului')).toContain(
      'personalul de execuție este instruit periodic la 3 luni, câte 2 ore, de conducătorul locului de muncă (Florin Cristian TALOȘ), cu cadrul tehnic, după caz'
    );
  });

  it('under ten employees lists only the documents the set holds and the daily and monthly checks', () => {
    const { organization } = sheetOf({ currentEmployeeCount: 4 });
    expect(valueOf(organization, 'Control intern de prevenire')).toBe(
      'da, de persoanele desemnate prin Decizia nr.\u00a05 PSI: șefii locurilor de muncă – zilnic sau pe schimb, la locul de muncă pe care îl conduc; coordonatorul privind apărarea împotriva incendiilor, Florin Cristian TALOȘ – lunar, controlul fiecărui stingător de incendiu'
    );
    expect(valueOf(organization, 'Ordinea interioară')).not.toContain('sezonul rece');
    const documents = valueOf(organization, 'Documente specifice de apărare împotriva incendiilor');
    expect(documents!.split('\n')).toHaveLength(17);
    expect(documents).not.toContain('controlul propriu');
    expect(documents).not.toContain('Graficele');
  });

  it('gives every gap the instruction of the model', () => {
    const sheet = sheetOf();
    const rows = [
      ...sheet.identity,
      ...sheet.general,
      ...sheet.buildings.flatMap((building) => [...building.constructive, ...building.technical]),
      ...sheet.substances.entries.flatMap((entry) => entry.rows),
      ...sheet.organization,
    ];
    expect(rows.filter((row) => row.value === null && !row.hint)).toEqual([]);
  });

  it('prints neither an archived workplace nor its building', () => {
    const sheet = sheetOf({ workplaces: facts.workplaces.filter((each) => each.id === officeId) });
    expect(sheet.buildings.map((building) => building.name)).toEqual(['Sediul social']);
    expect(facts.fireSafety.buildings[0]!.workplaceId).toBe(workshopId);
    expect(valueOf(sheet.general, 'Anul de construire (punere în funcțiune)')).toBeNull();
  });
});
