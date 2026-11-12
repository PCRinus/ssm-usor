export type UnitPath = {
  annex: string | null;
  article: string | null;
  alineat: string | null;
  letter: string | null;
  point: string | null;
};

export type AmendmentOperation = 'modified' | 'supplemented' | 'inserted' | 'repealed' | 'other';

export type AmendingAct = {
  // As the note writes it: "LEGEA", "ORDONANȚA DE URGENȚĂ", "HOTĂRÂREA".
  kind: string;
  number: string;
  // When it was adopted, as in its name; the note's own date is when the change took effect.
  date: string | null;
  name: string;
  portalId: number | null;
  gazette: { number: string; date: string | null } | null;
};

export type AmendmentNote = {
  // ISO date the change took effect; for a note that gives none, the date its act was published,
  // or failing that adopted, as `dated` says.
  date: string;
  dated: 'in_force' | 'published' | 'adopted';
  // Where the note sits in the consolidated text.
  path: UnitPath;
  // The unit the note's words name, which can be narrower than where it sits.
  named: UnitPath;
  subject: string;
  operation: AmendmentOperation;
  verb: string;
  // The provision of the amending act, "Punctul 2., Articolul I" or "lit. d) a pct. 35 al art. I".
  provision: string | null;
  amendingAct: AmendingAct | null;
  text: string;
};

const months: Record<string, string> = {
  ianuarie: '01',
  februarie: '02',
  martie: '03',
  aprilie: '04',
  mai: '05',
  iunie: '06',
  iulie: '07',
  august: '08',
  septembrie: '09',
  octombrie: '10',
  noiembrie: '11',
  decembrie: '12',
};

function isoDate(day: string, month: string, year: string) {
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function writtenDate(day: string, month: string, year: string) {
  const number = months[month.toLowerCase()];
  return number ? isoDate(day, number, year) : null;
}

export const noteStart = /^\(la (\d{2})-(\d{2})-(\d{4}),/;

const operations: [RegExp, AmendmentOperation][] = [
  [/^modificat/, 'modified'],
  [/^completat/, 'supplemented'],
  [/^introdus/, 'inserted'],
  [/^abrogat/, 'repealed'],
];

const prefixes: [RegExp, string][] = [
  [/^LEGE/, 'Legea'],
  [/^ORDONAN[ȚŢ]A DE URGEN[ȚŢ][ĂA]/, 'O.U.G.'],
  [/^ORDONAN[ȚŢ]A/, 'O.G.'],
  [/^HOT[ĂA]R[ÂA]RE/, 'H.G.'],
  [/^ORDIN/, 'Ordinul'],
  [/^DECIZIA/, 'Decizia'],
  [/^DECRET/, 'Decretul'],
];

const upper = 'A-ZĂÂÎȘȚŞŢ';
const actPattern = new RegExp(
  String.raw`([${upper}][${upper} ]*?)\s+nr\.\s*([\d.]+(?:\/[\d.]+)*)\s+din\s+(\d{1,2})\s+(\p{L}+)\s+(\d{4})`,
  'u'
);
const gazettePattern =
  /MONITORUL OFICIAL(?: al României)?(?:,? Partea I,)? nr\. (\d+(?: bis)?) din (\d{1,2}) (\p{L}+) (\d{4})/iu;

const label = String.raw`([0-9]+(?:\^[0-9]+)?|[IVXLC]+)`;
const namedPatterns: [keyof UnitPath, RegExp][] = [
  ['annex', /\b(?:Anexa|anexa|Anexei|anexei)\s*(?:nr\.\s*)?(\d+[A-Z]?)/u],
  [
    'article',
    new RegExp(String.raw`(?:Articolul|articolul|articolului|Art\.|art\.)\s*${label}\b`, 'u'),
  ],
  ['alineat', /(?:Alineatul|alineatul|alineatului|Alin\.|alin\.)\s*\(([^)]+)\)/u],
  ['letter', /(?:Litera|litera|literei|Lit\.|lit\.)\s*([a-z](?:\^\d+)?)\)/u],
  ['point', /(?:Punctul|punctul|punctului|Pct\.|pct\.)\s*(\d+(?:\^\d+)?)/u],
];

export function namedPath(subject: string): UnitPath {
  const path: UnitPath = { annex: null, article: null, alineat: null, letter: null, point: null };
  for (const [key, pattern] of namedPatterns) path[key] = pattern.exec(subject)?.[1] ?? null;
  return path;
}

export function actName(kind: string, number: string, date: string | null) {
  const prefix = prefixes.find(([pattern]) => pattern.test(kind))?.[1] ?? kind;
  return `${prefix} ${number.replaceAll('.', '')}${date ? `/${date.slice(0, 4)}` : ''}`;
}

export function parseNote(
  text: string,
  path: UnitPath,
  portalId: number | null
): AmendmentNote | null {
  const start = noteStart.exec(text);
  const inForce = start ? isoDate(start[1]!, start[2]!, start[3]!) : null;
  if (start && !inForce) return null;
  const rest = (start ? text.slice(start[0].length) : text).trim();
  const verbMatch = /\s+a fost (\p{L}+)(?:\s+(?:de|prin)\b)?/u.exec(rest);
  if (!start && !verbMatch) return null;
  const subject = (verbMatch ? rest.slice(0, verbMatch.index) : rest).replace(/\s+,/g, ',').trim();
  const verb = verbMatch?.[1] ?? '';
  const operation = operations.find(([pattern]) => pattern.test(verb))?.[1] ?? 'other';
  const after = verbMatch ? rest.slice(verbMatch.index + verbMatch[0].length) : '';
  const act = actPattern.exec(after);
  let amendingAct: AmendingAct | null = null;
  let provision: string | null = null;
  if (act) {
    const kind = act[1]!.trim();
    const actDate = writtenDate(act[3]!, act[4]!, act[5]!);
    const gazette = gazettePattern.exec(after.slice(act.index));
    provision =
      after
        .slice(0, act.index)
        .replace(/\s+din\s*$/, '')
        .replace(/\s+,/g, ',')
        .trim() || null;
    amendingAct = {
      kind,
      number: act[2]!.replaceAll('.', ''),
      date: actDate,
      name: actName(kind, act[2]!, actDate),
      portalId,
      gazette: gazette
        ? { number: gazette[1]!, date: writtenDate(gazette[2]!, gazette[3]!, gazette[4]!) }
        : null,
    };
  }
  const published = amendingAct?.gazette?.date ?? null;
  const date = inForce ?? published ?? amendingAct?.date ?? null;
  if (!date) return null;
  return {
    date,
    dated: inForce ? 'in_force' : published ? 'published' : 'adopted',
    path,
    named: namedPath(subject),
    subject,
    operation,
    verb,
    provision,
    amendingAct,
    text: text.trim(),
  };
}
