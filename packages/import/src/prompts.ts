export interface ProviderIdentity {
  name: string;
  cui: string;
  people: string[];
}

export interface ExistingClient {
  legalName: string;
  cui: string;
}

export type ContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user';
  content: string | ContentPart[];
}

export type ImportFile =
  | { path: string; text: string }
  // A data URL, as `data:image/jpeg;base64,…`.
  | { path: string; imageUrl: string };

function providerParagraph(provider: ProviderIdentity) {
  const people =
    provider.people.length > 0 ? `, whose people include ${provider.people.join(', ')}` : '';
  return [
    `The documents were written by the external safety service ${provider.name} (CUI ${provider.cui})${people}.`,
    'That service and its people appear in most documents and are never the client, nor are they the client’s people.',
    'Older documents may have been written by an earlier safety service; any SSM or PSI service and its people are never the client either.',
  ].join(' ');
}

function existingClientParagraph(client: ExistingClient | undefined) {
  if (client === undefined) return '';
  return `\n\nThe documents are imported into a client the app already has: ${client.legalName} (CUI ${client.cui}). They are about this company; another company's values are another client's.`;
}

export const sortingCharacters = 3_000;

export const sortingSystemPrompt = (provider: ProviderIdentity) =>
  `You sort the files of a Romanian occupational safety (SSM) and fire safety (PSI/SU) archive that a safety service keeps for one of its client companies. For each file you get its path and its beginning. ${providerParagraph(provider)}

For each file say:
- kind: what the document is.
  - decision: a decision (decizie) that names people or sets the client's rules.
  - own_instructions: the client's own safety instructions (instrucțiuni proprii).
  - training_themes: the training themes (tematica de instruire).
  - risk_assessment: the risk assessment or the prevention and protection plan.
  - fire_safety_document: another fire safety document, such as a list of means, an evacuation plan or a posted sheet.
  - contract: the service contract.
  - training_sheet: an individual training sheet (fișă de instruire individuală) filled in for a person.
  - blank_form: a register, test or form that is not filled in.
  - cover: a cover page, label or table of contents.
  - generic_text: legal extracts, manuals and generic training material.
  - other: anything else.
- companyName and companyCui: the client company the file is about, as written, never the safety service's. "" when the file names none.
- carriesClientData: whether the file holds facts about the client an importer needs: its identity, addresses and work points, named people and their roles, job positions and their activities, training intervals and durations, fire-safety means, protective equipment per position, employees. Generic text that only repeats the client's name in a header does not.

Give one entry per file, with its path exactly as given.`;

export function sortingMessages(input: {
  provider: ProviderIdentity;
  files: { path: string; text: string }[];
}): ChatMessage[] {
  const files = input.files
    .map((file) => `=== FILE: ${file.path} ===\n${file.text.slice(0, sortingCharacters)}`)
    .join('\n\n');
  return [
    { role: 'system', content: sortingSystemPrompt(input.provider) },
    { role: 'user', content: files },
  ];
}

// The rules are ADR 030's "The rules the model is given"; a change to one belongs there first.
export const readingSystemPrompt = (provider: ProviderIdentity, client?: ExistingClient) =>
  `You read the occupational safety (SSM) and fire safety (PSI/SU) documentation that a Romanian external safety service keeps for one client company, and extract what a safety app needs to create the client and generate its documentation again.

${providerParagraph(provider)}${existingClientParagraph(client)}

Sources:
- Each file starts with "=== FILE: <path> ===". "file" is that path exactly; "quote" is a short verbatim passage of that file, at most 200 characters, that contains the value. Tables are written as rows of "| cell | cell |": quote the words of the cells. Every value needs its file and quote; a value you cannot quote is left out.
- Copy values as written; do not translate or normalise names. Placeholders such as "-", "……", "____" and empty table cells are not values. Never invent counts, dates or names.
- An empty string means unknown. Numbers are written as digits, dates as YYYY-MM-DD.

Rules:
- The safety service's own data (its name, CUI, address and people) and anything about another SSM or PSI service is never proposed as the client's. The service is always the one importing.
- Documents are often copied from another client and not every name is replaced. A value that appears only in a passage copied from another company (that company's name next to it, or a post or person no other document of this client mentions) is still given, with "otherCompany" set to that company's name as written. Every other value has "otherCompany" "".
- Where documents disagree about a single value, give one fact for each value, each with its own file and quote. Do not choose between them.
- A workplace is an address. Rooms and areas at that address (kitchen, office, warehouse, workshop) are not workplaces; they are where fire-safety means stand.
- A one-person company: that person holds every role of responsiblePersons except workers_representative.
- The legal representative is also an employee when the documents show them on the staff. The contact person defaults to the legal representative.
- An equipment table naming several positions applies to each of them.
- The hire date comes from the date the person was admitted to work ("admis la lucru").

What to give:
- facts: one entry for each single value found; leave a field out when no document gives it.
  - client.legalName, client.cui (as written), client.tradeRegisterNumber (as written, J40/1234/2020 or J2024…), client.caenCode (four digits).
  - client.countyCode (the registered office's county, as its vehicle registration code: TM, CJ, B for Bucharest), client.locality, client.addressLine (street and number, without the locality and county).
  - client.legalRepresentativeName, client.legalRepresentativeRole (administrator, director general…).
  - client.contactName, client.contactPhone, client.contactEmail: the person a document names as the client's contact; when none does, the legal representative, with the phone and e-mail given for the client.
  - trainingSchedule.periodicTrainingMinutes (the periodic training's duration in minutes), trainingSchedule.administrativeTrainingIntervalMonths and trainingSchedule.workerTrainingIntervalMonths (the interval in months for technical-administrative staff and for execution staff), trainingSchedule.trainingFirstMonth (the month of the first periodic training, 1 to 12), trainingSchedule.trainingDayFrom and trainingSchedule.trainingDayTo (the days of the month it is held between): from the SSM training decision.
  - fireSafety.periodicTrainingHours, fireSafety.administrativeTrainingIntervalMonths, fireSafety.workerTrainingIntervalMonths: the same from the fire safety (PSI/SU) training decision, in hours.
  - fireSafety.smokingPolicy: "forbidden_everywhere" when smoking is forbidden on all the premises, "designated_places" when it is allowed in designated places; fireSafety.smokingPlace: where, as written.
  - fireSafety.wasteContractor: the firm that collects the waste.
- workplaces: one for each address where the client operates, the registered office included (isRegisteredOffice true). A work point named without an address is still a workplace. county as its vehicle registration code. activity: what is done there ("Restaurant", "Birouri"). rooms: the rooms and areas named at that address.
- jobPositions: the client's posts. staffCategory: "technical_administrative" or "execution" when the training decision puts the post in one, "" otherwise. trainingIntervalMonths only when the post is trained at another interval than its category's. workZone: the kind of place the work happens in ("Birou", "Atelier, teren"). activities: what the person in the post does, when a document says it for the post.
- responsiblePersons: the client's people named in decisions, one entry per person with all their roles: training at the workplace or heading a workplace → workplace_manager; first aid → first_aid; risk evaluation team → risk_evaluation_team; grave and imminent danger → imminent_danger; workers' representative → workers_representative; person responsible for fire safety → fire_safety_coordinator; leader of the first intervention team → fire_intervention_leader. workplace: the workplace's name when the role is for one workplace only, "" otherwise.
- fireEquipment: one entry for each kind of means at a place, with its count, only where a type or a count is filled in. workplace: the name of its workplace. room: the room or area. kind: extinguisher, sand_box, fire_post, fire_blanket or other. For an extinguisher, agent (P is powder, G or CO2 is co2, SM is foam, AP is water, clean_agent) and capacity in kilograms or litres ("P6" is powder, 6); wheeled for a wheeled one (carosabil).
- fireInstallations: detection_alarm, interior_hydrants, exterior_hydrants, sprinklers, smoke_exhaust, emergency_lighting, lightning_protection, gas_detection, or other with a description.
- protectiveEquipment: jobPositions (every post the entry is for, named as in jobPositions), risk, item, quantity, durationMonths (the normed duration of use in months; "" when it is a dash or until worn), allocation (personal_inventory, section_inventory when kept at the workplace and shared, consumable).
- employees: only the people a role needs: the workers' representative (role workers_representative) and the legal representative when the documents show them on the staff (role legal_representative: a one-person company, a post they hold, a role in a decision, an exposed person in the risk assessment). Nobody else. lastName and firstName apart; jobTitle: the post as written; hiredAt: "" when no document gives it; cnp and birthDate only when written.
- notes: in Romanian, short, what a reviewer must know that fits no value, such as a blank template among the documents.`;

export function readingMessages(input: {
  provider: ProviderIdentity;
  client?: ExistingClient;
  files: ImportFile[];
}): ChatMessage[] {
  const parts: ContentPart[] = input.files.flatMap((file): ContentPart[] =>
    'text' in file
      ? [{ type: 'text', text: `=== FILE: ${file.path} ===\n${file.text}` }]
      : [
          { type: 'text', text: `=== FILE: ${file.path} (image follows) ===` },
          { type: 'image_url', image_url: { url: file.imageUrl } },
        ]
  );
  return [
    { role: 'system', content: readingSystemPrompt(input.provider, input.client) },
    { role: 'user', content: parts },
  ];
}
