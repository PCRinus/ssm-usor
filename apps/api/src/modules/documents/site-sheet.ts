import {
  fireBuildingClassificationLabels,
  type FireDecision,
  fireDecisionTypeKeys,
  type FireInstallationKind,
  fireInstallationKindLabels,
  fireSafetyDocumentTitles,
  type FireSafetyDocumentTypeKey,
  type FireSafetyTypeKeyFromTenEmployees,
  fireSafetyTypeKeysFromTenEmployees,
  samePersonName,
  unfilledMark,
} from '@ssm-usor/contracts';

import { printedAddress } from '../../lib/address';
import { countOf, listed, runOn } from '../../lib/romanian';
import { printedDate } from './context';
import { extinguisherGroups, firmsOf } from './equipment';
import type { FireNamedPeople, FireSafetyClientFacts, FireSafetySetFacts } from './fire-safety';

/**
 * A row of the site sheet as OMAI 89/2013 annex 4 titles it. `value` null prints the gap mark
 * and `hint`, the model's own filling instruction; a value the data fills only in part carries
 * the mark inside it.
 */
export type SiteSheetRow = { title: string; value: string | null; hint: string };

export type SiteSheetContext = {
  identity: SiteSheetRow[];
  /** 1.1, a line per building where a fact differs by building. */
  general: SiteSheetRow[];
  /** 1.2, one per active fixed-space workplace: a mobile site is a point of work only. */
  buildings: {
    name: string;
    /** The name and the address, as the heading prints them. */
    place: string;
    constructive: SiteSheetRow[];
    technical: SiteSheetRow[];
  }[];
  noBuildings: boolean;
  /** Section 2: the declaration with `none`, a table per entry with `listed`. */
  substances: { none: boolean; listed: boolean; entries: { name: string; rows: SiteSheetRow[] }[] };
  organization: SiteSheetRow[];
};

export type SiteSheetInput = {
  facts: FireSafetySetFacts;
  decisionNumbers: Record<FireDecision, string>;
  people: FireNamedPeople;
  inSet: (typeKey: FireSafetyTypeKeyFromTenEmployees) => boolean;
};

type Building = FireSafetyClientFacts['buildings'][number];
type Installation = FireSafetyClientFacts['installations'][number];
type Unit = FireSafetyClientFacts['equipment'][number];

const trimmed = (text: string | null | undefined) => text?.trim() || null;

const row = (title: string, value: string | null, hint: string): SiteSheetRow => ({
  title,
  value,
  hint,
});

const decimal = (value: number) => String(value).replace('.', ',');

const decided = (number: string) => `Decizia nr.\u00a0${number}`;
const following = (number: string) => `potrivit Deciziei nr.\u00a0${number}`;

const notApplicable = 'nu este cazul';

const listedDocuments = [
  'fire_own_instructions',
  'fire_training_themes',
  'fire_test_hiring',
  'fire_test_annual',
  'fire_means_list',
  'fire_workplace_organization',
  'fire_substances_list',
  'fire_maintenance_schedules',
  'fire_registers',
  'fire_work_permit',
  'fire_installation_register',
  'fire_extinguisher_register',
] as const satisfies readonly FireSafetyDocumentTypeKey[];

const isFromTenEmployees = (
  typeKey: FireSafetyDocumentTypeKey
): typeKey is FireSafetyTypeKeyFromTenEmployees =>
  (fireSafetyTypeKeysFromTenEmployees as readonly string[]).includes(typeKey);

const collator = new Intl.Collator('ro');

function extinguisherLine(units: readonly Unit[]) {
  const groups = extinguisherGroups(units);
  if (groups.length === 0) return 'nu există';
  const counted = groups
    .map((group) => `${group.label} – ${group.units.length}\u00a0buc.`)
    .join(', ');
  const firms = firmsOf(groups.flatMap((group) => group.units.map((unit) => unit.maintainer)));
  return firms.length > 0
    ? `${counted}; verificate de ${listed(firms)}`
    : `${counted}; firma atestată care le verifică: ${unfilledMark}`;
}

function installationLine(installation: Installation) {
  const description = trimmed(installation.description);
  const parts = [
    description && runOn(description),
    trimmed(installation.maintainer) && `firma de service: ${installation.maintainer!.trim()}`,
    installation.lastCheckOn && `ultima verificare: ${printedDate(installation.lastCheckOn)}`,
  ].filter(Boolean);
  return ['există', ...parts].join('; ');
}

/** Absent from the inventory, a kind prints as "nu există": the inventory is the record. */
const inventoried = (installations: readonly Installation[], kind: FireInstallationKind) => {
  const found = installations.filter((installation) => installation.kind === kind);
  return found.length > 0 ? found.map(installationLine).join('\n') : 'nu există';
};

function both(
  first: string | null,
  second: string | null,
  firstLabel: string,
  secondLabel: string
) {
  if (first === null && second === null) return null;
  return `${first ?? `${firstLabel}: ${unfilledMark}`}; ${second ?? `${secondLabel}: ${unfilledMark}`}`;
}

export function buildSiteSheet({
  facts,
  decisionNumbers,
  people,
  inSet,
}: SiteSheetInput): SiteSheetContext {
  const { client, organization, fireSafety } = facts;
  const card = fireSafety.card;
  const coordinatorName = people.coordinator.name;
  const workplaceManagerNames = people.managerNames;
  const workplaces = [...facts.workplaces].sort(
    (a, b) =>
      Number(b.registeredOffice) - Number(a.registeredOffice) || collator.compare(a.name, b.name)
  );
  const active = new Set(workplaces.map((workplace) => workplace.id));
  const equipment = fireSafety.equipment.filter((unit) => active.has(unit.workplaceId));
  const installations = fireSafety.installations.filter((each) => active.has(each.workplaceId));
  const fixedSpaces = workplaces.filter((workplace) => workplace.kind === 'fixed_space');
  const buildingOf = (workplaceId: string): Building | null =>
    fireSafety.buildings.find((building) => building.workplaceId === workplaceId) ?? null;

  const representativeName = trimmed(client.representativeName);
  const representativeRole = trimmed(client.representativeRole);
  const contactIsRepresentative =
    representativeName !== null &&
    trimmed(client.contactName) !== null &&
    samePersonName(client.contactName!.trim(), representativeName);
  const registeredOffice = workplaces.find((workplace) => workplace.registeredOffice);
  const operatorAddress =
    printedAddress(client) || (registeredOffice && printedAddress(registeredOffice)) || null;
  const contacts = [
    trimmed(client.contactPhone) && `telefon: ${client.contactPhone!.trim()}`,
    trimmed(client.contactEmail) && `e-mail: ${client.contactEmail!.trim()}`,
  ].filter(Boolean);
  const technicianName = trimmed(organization.fireSafetyTechnicianName);
  const certificate = trimmed(organization.fireSafetyTechnicianCertificate);
  const providerName = trimmed(organization.legalName);
  const tradeRegister = [trimmed(client.tradeRegisterNumber), `CUI ${client.cui.trim()}`]
    .filter(Boolean)
    .join(', ');

  const branches = workplaces.filter((workplace) => !workplace.registeredOffice);
  const pointsOfWork =
    branches.length === 0
      ? notApplicable
      : [
          ...branches.map((workplace) => {
            const note = workplace.kind === 'mobile_site' ? ' (șantier temporar sau mobil)' : '';
            const address = printedAddress(workplace) || `adresa: ${unfilledMark}`;
            return `– ${workplace.name.trim()}${note}: ${address}`;
          }),
          `Telefon, fax, e-mail pentru fiecare: ${unfilledMark}`,
        ].join('\n');

  const technicianLabel =
    'Cadru tehnic cu atribuții în domeniul apărării împotriva incendiilor/Inspector de protecție civilă';
  const identity = [
    row(
      'Denumirea operatorului economic/instituției',
      client.legalName.trim(),
      'denumirea în clar'
    ),
    row(
      'Administrator/Conducător – date de identificare',
      representativeName &&
        [representativeName, representativeRole && runOn(representativeRole)]
          .filter(Boolean)
          .join(', '),
      'numele și prenumele, funcția'
    ),
    row(
      'Administrator/Conducător – telefon serviciu',
      contactIsRepresentative ? trimmed(client.contactPhone) : null,
      'telefonul de serviciu și faxul administratorului'
    ),
    row(
      'Administrator/Conducător – telefon domiciliu',
      null,
      'telefonul de domiciliu, faxul și adresa de e-mail ale administratorului'
    ),
    row(
      'Coordonatele operatorului economic/instituției – adresa',
      operatorAddress,
      'adresa sediului unde se află operatorul economic/instituția'
    ),
    row(
      'Coordonatele operatorului economic/instituției – telefon, fax, e-mail',
      contacts.length > 0 ? contacts.join(', ') : null,
      'telefonul, faxul și adresa de e-mail ale operatorului'
    ),
    row(
      'Coordonatele filialelor/sucursalelor/punctelor de lucru (dacă este cazul)',
      pointsOfWork,
      'adresa, telefonul, faxul și adresa de e-mail ale fiecărui punct de lucru'
    ),
    row(
      'Număr de înregistrare din registrul comerțului',
      tradeRegister,
      'numărul de ordine în registrul comerțului sau codul unic de înregistrare'
    ),
    row(
      `${technicianLabel} – nume și prenume`,
      technicianName &&
        (providerName ? `${technicianName}, reprezentant al ${providerName}` : technicianName),
      'numele și prenumele cadrului tehnic'
    ),
    row(
      `${technicianLabel} – telefon serviciu`,
      trimmed(organization.phone),
      'telefonul de serviciu al cadrului tehnic'
    ),
    row(
      `${technicianLabel} – telefon domiciliu`,
      null,
      'telefonul de domiciliu al cadrului tehnic'
    ),
    row(
      `${technicianLabel} – certificat de competență, termen de valabilitate`,
      certificate && `${certificate}; termen de valabilitate: ${unfilledMark}`,
      'numărul certificatului de competență și termenul lui de valabilitate'
    ),
  ];

  const perBuilding = (fact: (building: Building) => string | null) => {
    if (fixedSpaces.length === 0) {
      return 'nu este cazul: activitatea se desfășoară numai în puncte de lucru temporare sau mobile';
    }
    const values = fixedSpaces.map((workplace) => {
      const building = buildingOf(workplace.id);
      return building ? fact(building) : null;
    });
    if (values.every((value) => value === null)) return null;
    if (fixedSpaces.length === 1) return values[0]!;
    return fixedSpaces
      .map(
        (workplace, index) =>
          `Clădirea ${index + 1} (${workplace.name.trim()}): ${values[index] ?? unfilledMark}`
      )
      .join('\n');
  };

  const activities = [
    ...new Set(workplaces.flatMap((workplace) => trimmed(workplace.activity) ?? [])),
  ];
  const caen = trimmed(client.caenCode);
  const employees =
    facts.currentEmployeeCount === 0
      ? 'niciun angajat'
      : countOf(facts.currentEmployeeCount, 'angajat', 'angajați');

  const general = [
    row(
      'Domeniul de activitate',
      activities.length > 0
        ? [...activities, ...(caen ? [`cod CAEN ${caen}`] : [])].join('; ')
        : null,
      'se alege unul dintre domeniile modelului: administrativ; comercial; cult; cultură; educație; financiar-bancar; fond forestier; monumente istorice și de arhitectură; sănătate; sport; agrement; turism; transporturi; operatori economici cu risc mare și foarte mare de incendiu; alte domenii de activitate'
    ),
    row(
      'Anul de construire (punere în funcțiune)',
      perBuilding((building) => (building.yearBuilt === null ? null : String(building.yearBuilt))),
      'anul punerii în funcțiune; modificările, modernizările sau extinderile, cu anul lor; numărul avizului sau al autorizației de securitate la incendiu, dacă există'
    ),
    row(
      'Suprafața construită/desfășurată',
      perBuilding((building) =>
        building.builtAreaM2 === null ? null : `${decimal(building.builtAreaM2)}\u00a0m²`
      ),
      'în m², pentru fiecare construcție'
    ),
    row(
      'Număr niveluri (regim de înălțime)',
      perBuilding((building) => trimmed(building.levels)),
      'numărul de niveluri și înălțimea în m, pentru fiecare construcție'
    ),
    row(
      'Clasificare construcție (civilă, de producție, de depozitare, cu funcțiuni mixte)',
      perBuilding((building) =>
        building.classification === null
          ? null
          : fireBuildingClassificationLabels[building.classification]
      ),
      'civilă, de producție, de depozitare sau cu funcțiuni mixte'
    ),
    row(
      'Structura de rezistență a construcției (structură metalică, beton armat, zidărie, lemn, mixtă etc.)',
      perBuilding((building) => trimmed(building.structure)),
      'structură metalică, beton armat, zidărie, lemn, mixtă etc.'
    ),
    row(
      'Personal angajat',
      `${employees} în total; numărul estimativ pe fiecare clădire: ${unfilledMark}`,
      'număr estimativ, pentru fiecare clădire'
    ),
    row(
      'Utilizarea clădirii',
      null,
      'prezența oamenilor în clădire, permanent sau temporar, în timpul și în afara programului de lucru, în week-end și de sărbători, cu numărul maxim de persoane prezente simultan; pericolele din vecinătăți'
    ),
  ];

  const buildings = fixedSpaces.map((workplace) => {
    const building = buildingOf(workplace.id);
    const here = installations.filter((each) => each.workplaceId === workplace.id);
    const units = equipment.filter((unit) => unit.workplaceId === workplace.id);
    const address = printedAddress(workplace);
    const fuel = trimmed(building?.heatingFuel);
    const gasUse = trimmed(building?.gasUse);
    const electricalMaintainer = trimmed(building?.electricalMaintainer);
    const electricalCheck = building?.electricalLastCheckOn ?? null;
    const notes = trimmed(building?.notes);
    const alarm = here.some((each) => each.kind === 'detection_alarm');
    return {
      name: workplace.name.trim(),
      place: address ? `${workplace.name.trim()}, ${address}` : workplace.name.trim(),
      constructive: [
        row(
          'Stabilitatea la foc',
          null,
          'din proiect sau din alte documente tehnice; în lipsa lor se precizează că conducerea nu poate prezenta documente privind stabilitatea la foc'
        ),
        row(
          'Compartimente de incendiu',
          null,
          'numărul compartimentelor de incendiu, suprafața și înălțimea fiecăruia'
        ),
        row(
          'Căi de acces, intervenție și evacuare',
          null,
          'numărul, gabaritul, marcarea și semnalizarea lor'
        ),
        row(
          'Case de scări (închise/deschise)',
          null,
          'numărul, gabaritul și alcătuirea constructivă'
        ),
        row('Ascensoare de intervenție', null, 'dacă există, potrivit reglementării'),
      ],
      technical: [
        row(
          'Sisteme de ventilație/climatizare',
          null,
          'dacă există; contractul de întreținere și reparare cu o firmă autorizată și ultima verificare, sau exploatarea prin personal propriu calificat'
        ),
        row(
          'Sisteme de încălzire',
          fuel && `combustibil: ${fuel}; întreținerea și ultima verificare: ${unfilledMark}`,
          'dacă există; tipul combustibilului; contractul de întreținere și reparare cu o firmă autorizată și ultima verificare, sau exploatarea prin personal propriu calificat'
        ),
        row(
          'Instalații electrice',
          both(
            electricalMaintainer && `întreținute de ${electricalMaintainer}`,
            electricalCheck && `ultima verificare: ${printedDate(electricalCheck)}`,
            'firma care le întreține',
            'ultima verificare'
          ),
          'contractul de întreținere și reparare cu o firmă autorizată și ultima verificare, sau exploatarea prin personal propriu calificat'
        ),
        row(
          'Instalație de alimentare cu gaze naturale/G.P.L.',
          gasUse && `există; utilizare: ${runOn(gasUse)}`,
          'dacă există; scopul utilizării (prepararea hranei, încălzire, uz industrial)'
        ),
        row(
          'Iluminat de siguranță',
          inventoried(here, 'emergency_lighting'),
          'dacă există; tipul de alimentare, categoria (continuarea lucrului, evacuare, intervenție) și spațiile protejate'
        ),
        row(
          'Sisteme și instalații tehnologice',
          trimmed(workplace.fireRiskEquipment),
          'se enumeră sistemele și instalațiile tehnologice, dacă există'
        ),
        row(
          'Sistem/dispozitiv de evacuare a fumului și gazelor fierbinți',
          inventoried(here, 'smoke_exhaust'),
          'dacă există; sistemul de acționare și spațiile protejate'
        ),
        row(
          'Sisteme de detectare a incendiilor',
          inventoried(here, 'detection_alarm'),
          'dacă există; tipul, spațiile protejate, firma atestată care o întreține și ultima verificare'
        ),
        row(
          'Sisteme de alarmare/avertizare',
          alarm
            ? `prin instalația de detectare, semnalizare și avertizare la incendiu; tipul avertizării: ${unfilledMark}`
            : null,
          'dacă există; tipul: sonoră (bandă preînregistrată, megafon etc.) sau silențioasă'
        ),
        row(
          'Sisteme de limitare a propagării incendiilor',
          null,
          'uși rezistente la foc, clapete antifoc, sisteme de obturare, oprirea automată a ventilării, protecții ale structurilor, cu compartimentul în care sunt prevăzute'
        ),
        row(
          'Sisteme de detectare a gazelor',
          inventoried(here, 'gas_detection'),
          'dacă există; spațiile protejate'
        ),
        row(
          'Instalații speciale de stingere cu apă',
          inventoried(here, 'sprinklers'),
          'tipul (sprinklere, apă pulverizată etc.), zonele protejate, numărul capetelor de refulare'
        ),
        row(
          'Instalații de stingere cu gaze/aerosoli',
          null,
          'dacă există; tipul, zonele protejate, numărul capetelor de refulare'
        ),
        row(
          'Alte instalații de stingere (pulbere, spumă etc.)',
          null,
          'dacă există; tipul instalației, spațiile protejate și numărul de sectoare'
        ),
        row(
          'Instalație de protecție împotriva trăsnetului',
          inventoried(here, 'lightning_protection'),
          'dacă există; dacă este verificată de o firmă atestată'
        ),
        row(
          'Stingătoare',
          extinguisherLine(units),
          'pe tipodimensiuni; dacă sunt verificate de o firmă atestată'
        ),
        row(
          'Hidranți interiori/coloane uscate',
          inventoried(here, 'interior_hydrants'),
          'dacă există; alimentarea de la rețeaua orașului sau din rezerva de apă (m³)'
        ),
        row(
          'Hidranți exteriori',
          inventoried(here, 'exterior_hydrants'),
          'dacă există; numărul, distanța față de clădire și pe ce laturi, alimentarea'
        ),
        row(
          'Alimentarea cu apă pentru stingerea incendiilor (rezerva de apă, pompe)',
          building?.waterReserveM3 == null
            ? null
            : building.waterReserveM3 === 0
              ? 'nu există o rezervă proprie de apă pentru stingerea incendiilor'
              : `rezerva de apă: ${decimal(building.waterReserveM3)}\u00a0m³; pompele: ${unfilledMark}`,
          'rezerva de apă (m³); pompele (număr, m³/min)'
        ),
        row(
          'Utilaje și autospeciale de intervenție din dotarea serviciului privat pentru situații de urgență',
          'nu este cazul: operatorul nu are serviciu privat pentru situații de urgență',
          'utilajele și autospecialele serviciului privat, dacă există'
        ),
        row(
          'Stocuri de produse de stingere/neutralizatori',
          null,
          'stocurile de produse de stingere și de neutralizatori, dacă există'
        ),
        row(
          'Echipament de protecție al personalului de intervenție în funcție de riscurile existente și de efectele negative ale incendiilor specifice',
          null,
          'echipamentul de protecție al echipei de primă intervenție, potrivit riscurilor'
        ),
        ...(notes ? [row('Alte precizări', notes, '')] : []),
      ],
    };
  });

  const listedSubstances = fireSafety.substances.state === 'listed';
  const substances: SiteSheetContext['substances'] = {
    none: !listedSubstances,
    listed: listedSubstances,
    entries: listedSubstances
      ? fireSafety.substances.entries.map((entry) => ({
          name: entry.name.trim(),
          rows: [
            row(
              'Denumirea substanțelor periculoase folosite, clasificare',
              `${entry.name.trim()} – ${entry.classification.trim()}`,
              'în conformitate cu sistemul internațional de clasificare a substanțelor periculoase, frazele de risc asociate'
            ),
            row(
              'Cantitatea existentă în unitate',
              entry.quantity.trim(),
              'pentru fiecare substanță'
            ),
            row(
              'Loc de depozitare',
              trimmed(entry.storagePlace),
              'instalație, echipament de proces, sistem de stocare, sistem de compresie, conducte etc.'
            ),
            row('Mod de operare', trimmed(entry.handling), 'modul de manipulare și de utilizare'),
          ],
        }))
      : [],
  };

  const administrative = facts.jobPositions.some(
    (position) => position.staffCategory === 'technical_administrative'
  );
  const execution = facts.jobPositions.some((position) => position.staffCategory === 'execution');
  const technician = technicianName
    ? `cadrul tehnic PSI, ${technicianName}${certificate ? `, titular al certificatului ${certificate}` : ''}`
    : 'cadrul tehnic PSI';
  const managers =
    workplaceManagerNames.length === 0
      ? 'conducătorii locurilor de muncă'
      : workplaceManagerNames.length === 1
        ? `conducătorul locului de muncă (${workplaceManagerNames[0]})`
        : `conducătorii locurilor de muncă (${listed(workplaceManagerNames)})`;
  const periodically = (months: number | null) =>
    [
      months === null ? 'periodic' : `periodic la ${countOf(months, 'lună', 'luni')}`,
      card?.periodicTrainingHours != null &&
        `câte ${countOf(card.periodicTrainingHours, 'oră', 'ore')}`,
    ]
      .filter(Boolean)
      .join(', ');
  const training = card
    ? `da, ${following(decisionNumbers.training)}: ${[
        administrative &&
          `personalul administrativ este instruit ${periodically(card.administrativeTrainingIntervalMonths)}, de ${technician}`,
        execution &&
          `personalul de execuție este instruit ${periodically(card.workerTrainingIntervalMonths)}, de ${managers}, cu cadrul tehnic, după caz`,
      ]
        .filter((part): part is string => Boolean(part))
        .join('; ')}`
    : null;

  const control = inSet('fire_decision_control')
    ? `da, ${following(decisionNumbers.control)}: coordonatorul privind apărarea împotriva incendiilor, ${coordinatorName}, și cadrul tehnic – trimestrial, pe tot perimetrul${card?.hasThirdParties ? ' și la persoanele juridice care desfășoară activități în spațiile operatorului' : ''}; coordonatorul – lunar, fiecare stingător; șefii locurilor de muncă – zilnic sau pe schimb; personalul de execuție – zilnic, la terminarea programului; conducerea, cu coordonatorul și cadrul tehnic – anual, în ianuarie`
    : `da, de persoanele desemnate prin ${decided(decisionNumbers.organization)}: șefii locurilor de muncă – zilnic sau pe schimb, la locul de muncă pe care îl conduc; coordonatorul privind apărarea împotriva incendiilor, ${coordinatorName} – lunar, controlul fiecărui stingător de incendiu`;

  const rules = [
    `${decided(decisionNumbers.openFire)} privind lucrul cu foc deschis`,
    `${decided(decisionNumbers.smoking)} privind fumatul`,
    `${decided(decisionNumbers.waste)} privind colectarea deșeurilor`,
    ...(inSet('fire_decision_seasons')
      ? [`${decided(decisionNumbers.seasons)} privind perioadele caniculare și sezonul rece`]
      : []),
  ];

  const holds = (typeKey: FireSafetyDocumentTypeKey) =>
    !isFromTenEmployees(typeKey) || inSet(typeKey);
  const documents = [
    ...(
      Object.entries(fireDecisionTypeKeys) as [FireDecision, FireSafetyDocumentTypeKey][]
    ).flatMap(([decision, typeKey]) =>
      holds(typeKey)
        ? [
            fireSafetyDocumentTitles[typeKey].replace(
              /^Decizia /,
              `${decided(decisionNumbers[decision])} `
            ),
          ]
        : []
    ),
    ...listedDocuments.filter(holds).map((typeKey) => fireSafetyDocumentTitles[typeKey]),
  ];

  const extinguisherFirms = firmsOf(
    equipment.filter((unit) => unit.kind === 'extinguisher').map((unit) => unit.maintainer)
  );
  const maintenance = [
    ...(equipment.some((unit) => unit.kind === 'extinguisher')
      ? [
          `– stingătoarele: ${extinguisherFirms.length > 0 ? listed(extinguisherFirms) : unfilledMark}`,
        ]
      : []),
    ...installations.map(
      (installation) =>
        `– ${runOn(fireInstallationKindLabels[installation.kind])}${installation.kind === 'other' && trimmed(installation.description) ? ` (${installation.description!.trim()})` : ''}: ${trimmed(installation.maintainer) ?? unfilledMark}`
    ),
    ...(inSet('fire_maintenance_schedules')
      ? ['Verificările se fac după graficele de întreținere și verificare.']
      : []),
  ];

  const organizationRows = [
    row(
      'Organizarea alarmării',
      `da, prin ${decided(decisionNumbers.organization)} privind organizarea apărării împotriva incendiilor: ${coordinatorName} asigură observarea și anunțarea incendiului pe plan intern și prin apel la 112, iar șeful echipei de primă intervenție, ${people.interventionLeader.name}, anunță 112; fișa de organizare a apărării împotriva incendiilor este afișată la fiecare loc de muncă`,
      'dacă este organizată și pe baza căror documente'
    ),
    row(
      'Instruirea personalului',
      training,
      'dacă se face periodic (periodicitatea pe categorii de personal), de către cine, dacă este persoană atestată'
    ),
    row('Control intern de prevenire', control, 'dacă se execută, la ce interval și de către cine'),
    row(
      'Serviciu privat pentru situații de urgență',
      notApplicable,
      'dacă există sau dacă este încheiat un contract: obiectul contractului, datele firmei'
    ),
    row(
      'Planuri/exerciții de evacuare din clădire',
      null,
      'când s-a executat ultima oară exercițiul de evacuare și ce probleme deosebite au fost constatate'
    ),
    row(
      'Afișare instrucțiuni specifice',
      `da: instrucțiunile de apărare împotriva incendiilor aprobate prin ${decided(decisionNumbers.instructions)} se afișează la fiecare loc de muncă`,
      'dacă există'
    ),
    row(
      'Obligațiile administratorului/conducerii',
      `da: stabilite prin ${decided(decisionNumbers.organization)} privind organizarea apărării împotriva incendiilor`,
      'dacă există și ce documente sunt întocmite'
    ),
    row(
      'Obligațiile cadrului tehnic/inspectorului/personalului din structura cu atribuții de apărare împotriva incendiilor/de protecție civilă',
      `da: ${decided(decisionNumbers.technician)} privind cadrul tehnic PSI, cu obligațiile din anexa ei, și ${decided(decisionNumbers.organization)} privind organizarea apărării împotriva incendiilor, pentru coordonator și echipa de primă intervenție`,
      'dacă există și ce documente sunt întocmite pentru reglementarea lor'
    ),
    row(
      'Ordinea interioară',
      `reglementată prin ${listed(rules)}; asigurarea căilor de acces, de evacuare și de intervenție: ${unfilledMark}`,
      'reglementările pentru lucrul cu foc deschis, fumat, deșeuri, sezonul rece și perioadele caniculare; căile de acces, de evacuare și de intervenție'
    ),
    row(
      'Documente specifice de apărare împotriva incendiilor',
      documents.map((document) => `– ${document}`).join('\n'),
      'potrivit reglementărilor în domeniu'
    ),
    row('Documente specifice de protecție civilă', null, 'potrivit reglementărilor în domeniu'),
    row(
      'Reglementarea modului de întreținere, verificare, reparare a mijloacelor tehnice de apărare împotriva incendiilor',
      maintenance.length > 0 ? maintenance.join('\n') : null,
      'persoana juridică atestată care întreține, verifică și repară fiecare mijloc'
    ),
    row(
      'Evidența incendiilor de la punerea în funcțiune a operatorului economic/instituției (pe fiecare clădire în parte)',
      null,
      'incendiile produse, pe fiecare clădire, cu cauzele lor'
    ),
  ];

  return {
    identity,
    general,
    buildings,
    noBuildings: buildings.length === 0,
    substances,
    organization: organizationRows,
  };
}
