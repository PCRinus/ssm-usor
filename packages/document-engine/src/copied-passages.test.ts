import { existsSync, readFileSync } from 'node:fs';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

// A template may print a passage of another, copied at import (ADR 019): the fire-safety set's
// first aid is 3.2's. The import lists each copy in copied-passages.json, since its specs live
// outside the repository, and a copy that no longer reads as its source fails here, so a
// correction cannot reach one set and not the other.

type CopiedPassage = { template: string; from: string; first: string; last: string };

const templatesUrl = new URL('../templates/', import.meta.url);

const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

// The body's own paragraphs, as the import finds the passage: a table's cells are not among them.
function bodyParagraphs(docx: Uint8Array) {
  const xml = new PizZip(docx).file('word/document.xml')!.asText();
  return (xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '').match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map(
    (paragraph) =>
      decode(
        [...paragraph.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('')
      )
  );
}

function passage(paragraphs: string[], first: string, last: string) {
  const start = paragraphs.findIndex((text) => new RegExp(first, 'u').test(text));
  if (start === -1) return null;
  const end = paragraphs.findIndex(
    (text, index) => index >= start && new RegExp(last, 'u').test(text)
  );
  return end === -1 ? null : paragraphs.slice(start, end + 1);
}

function differences(copy: Uint8Array, source: Uint8Array, { first, last }: CopiedPassage) {
  const copied = passage(bodyParagraphs(copy), first, last);
  const original = passage(bodyParagraphs(source), first, last);
  if (!copied) return [`the copy has no passage from /${first}/ to /${last}/`];
  if (!original) return [`the source has no passage from /${first}/ to /${last}/`];
  const found: string[] = [];
  for (let index = 0; index < Math.max(copied.length, original.length); index += 1) {
    if (copied[index] !== original[index]) {
      found.push(
        `paragraph ${index + 1}: ${JSON.stringify(original[index] ?? null)} in the source, ${JSON.stringify(copied[index] ?? null)} in the copy`
      );
    }
  }
  return found;
}

function docx(paragraphs: (string | string[])[], table = false) {
  const runs = (text: string | string[]) =>
    (Array.isArray(text) ? text : [text])
      .map((run) => `<w:r><w:t xml:space="preserve">${run.replace(/&/g, '&amp;')}</w:t></w:r>`)
      .join('');
  const body = paragraphs.map((text) => `<w:p><w:pPr/>${runs(text)}</w:p>`);
  if (table) {
    body.splice(
      1,
      0,
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Celulă</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    );
  }
  const zip = new PizZip();
  zip.file('word/document.xml', `<w:document><w:body>${body.join('')}</w:body></w:document>`);
  return zip.generate({ type: 'uint8array' });
}

describe('a copied passage', () => {
  const entry: CopiedPassage = {
    template: 'fire/copy.docx',
    from: 'source.docx',
    first: '^Primul ajutor',
    last: '^Salvatorul nu',
  };
  const source = docx([
    'Capitolul VII',
    'Primul ajutor este ajutorul imediat.',
    'Conduita salvatorului cuprinde:',
    'Salvatorul nu trebuie să devină a doua victimă.',
    'Capitolul VIII',
  ]);

  it('reads as its source, whatever the paragraphs around it and the runs it is split into', () => {
    const copy = docx(
      [
        'Art. 1. Decizia',
        'Primul ajutor este ajutorul imediat.',
        ['Conduita ', 'salvatorului', ' cuprinde:'],
        'Salvatorul nu trebuie să devină a doua victimă.',
        'Prezenta decizie',
      ],
      true
    );
    expect(differences(copy, source, entry)).toEqual([]);
  });

  it('differs from its source by a word, and says in which paragraph', () => {
    const copy = docx([
      'Primul ajutor este ajutorul imediat.',
      'Conduita salvatorului cuprinde:',
      'Salvatorul nu trebuie să devină a două victimă.',
    ]);
    expect(differences(copy, source, entry)).toEqual([
      'paragraph 3: "Salvatorul nu trebuie să devină a doua victimă." in the source, "Salvatorul nu trebuie să devină a două victimă." in the copy',
    ]);
  });

  it('differs from its source by a paragraph added or left out', () => {
    const copy = docx([
      'Primul ajutor este ajutorul imediat.',
      'Salvatorul nu trebuie să devină a doua victimă.',
    ]);
    expect(differences(copy, source, entry)).toEqual([
      'paragraph 2: "Conduita salvatorului cuprinde:" in the source, "Salvatorul nu trebuie să devină a doua victimă." in the copy',
      'paragraph 3: "Salvatorul nu trebuie să devină a doua victimă." in the source, null in the copy',
    ]);
  });

  it('is missing from a copy or a source without its first or last paragraph', () => {
    expect(differences(docx(['Primul ajutor este ajutorul imediat.']), source, entry)).toEqual([
      'the copy has no passage from /^Primul ajutor/ to /^Salvatorul nu/',
    ]);
    expect(differences(source, docx(['Capitolul VII']), entry)).toEqual([
      'the source has no passage from /^Primul ajutor/ to /^Salvatorul nu/',
    ]);
  });
});

const registry = JSON.parse(
  readFileSync(new URL('copied-passages.json', templatesUrl), 'utf8')
) as { passages: CopiedPassage[] };
const read = (name: string) => new Uint8Array(readFileSync(new URL(name, templatesUrl)));

describe('copied-passages.json', () => {
  it('names templates that exist', () => {
    for (const entry of registry.passages) {
      expect(existsSync(new URL(entry.template, templatesUrl)), entry.template).toBe(true);
      expect(existsSync(new URL(entry.from, templatesUrl)), entry.from).toBe(true);
    }
  });

  it.each(registry.passages.map((entry) => [entry.template, entry.first, entry] as const))(
    '%s copies the passage from /%s/ as its source prints it',
    (_, __, entry) => {
      expect(differences(read(entry.template), read(entry.from), entry)).toEqual([]);
    }
  );
});
