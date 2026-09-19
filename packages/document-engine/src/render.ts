import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import { isTextPart, replaceInXml } from './author';

// Merges data into a Word template (ADR 005). Templates carry `{{ }}` placeholders:
//
//   {{client.legalName}}                       a value, by dotted path
//   {{#firstAiders}} … {{name}} … {{/firstAiders}}   a repeated block. With both tags in one
//                                              table row it repeats the row; with each tag
//                                              alone in its own paragraph it repeats the
//                                              paragraphs between them; otherwise inline
//   {{.}}                                      the current item of a list of strings
//
// A placeholder without a value is an error, never a blank: a generated document must not
// leave a gap where a name belongs.

export type TemplateData = Record<string, unknown>;

/** A template that could not be merged. `missing` lists the placeholders without a value. */
export class TemplateError extends Error {
  constructor(
    message: string,
    readonly missing: string[] = []
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

interface ParserContext {
  scopeList: unknown[];
  num: number;
}

function lookup(scope: unknown, path: string[]): unknown {
  let value = scope;
  for (const key of path) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

// docxtemplater's own parser reads one property name. This one reads a dotted path and looks
// it up from the innermost scope outwards, so a row of a list can still print the client.
// It evaluates nothing, which is what Workers require: no `eval`, no `new Function`.
function parser(tag: string) {
  const path = tag.trim();
  return {
    get(scope: unknown, context: ParserContext) {
      if (path === '.') return scope;
      const keys = path.split('.');
      for (let index = context.num; index >= 0; index -= 1) {
        const value = lookup(context.scopeList[index], keys);
        if (value !== undefined) return value;
      }
      return undefined;
    },
  };
}

interface DocxtemplaterFailure {
  properties?: { errors?: { properties?: { explanation?: string; id?: string } }[] };
}

function explain(cause: unknown) {
  const errors = (cause as DocxtemplaterFailure).properties?.errors ?? [];
  const explanations = errors.map((error) => error.properties?.explanation).filter(Boolean);
  return explanations.length > 0
    ? explanations.join(' ')
    : cause instanceof Error
      ? cause.message
      : 'The template could not be read.';
}

/** Returns the merged `.docx`. Throws a `TemplateError` for a broken template or a missing value. */
export function renderDocument(template: Uint8Array, data: TemplateData): Uint8Array {
  const missing = new Set<string>();
  let document: Docxtemplater;
  try {
    document = new Docxtemplater(new PizZip(template), {
      delimiters: { start: '{{', end: '}}' },
      // Loop tags alone in their paragraphs leave no empty paragraphs behind.
      paragraphLoop: true,
      linebreaks: true,
      parser,
      nullGetter: (part: { value?: string; module?: string }) => {
        // A loop over nothing is an empty list, which is a legitimate value.
        if (part.module === 'loop') return [];
        missing.add(part.value ?? '?');
        return '';
      },
    });
    document.render(data);
  } catch (cause) {
    throw new TemplateError(explain(cause));
  }
  if (missing.size > 0) {
    const names = [...missing].sort();
    throw new TemplateError(`The template has no value for: ${names.join(', ')}.`, names);
  }
  return tidy(document.getZip()).generate({ type: 'uint8array', compression: 'DEFLATE' });
}

// What only shows once values are in. A company name that ends in a full stop, closing a
// sentence, gives "S.R.L..": the template cannot know, so the engine drops the second one. An
// ellipsis is left alone.
const punctuation = [{ pattern: '(?<!\\.)\\.\\.(?!\\.)', replace: '.' }];

function tidy(zip: PizZip) {
  for (const name of Object.keys(zip.files).filter(isTextPart)) {
    // The two full stops are often in different runs, so the XML cannot be searched for "..".
    zip.file(name, replaceInXml(zip.file(name)!.asText(), punctuation));
  }
  return zip;
}

/**
 * Every placeholder a template uses, for checking a template against the data it will get.
 * Names inside a loop are listed as written, relative to the loop's items.
 */
export function templatePlaceholders(template: Uint8Array): string[] {
  const names = new Set<string>();
  const collector = (tag: string) => {
    names.add(tag.trim());
    return { get: () => '' };
  };
  try {
    const document = new Docxtemplater(new PizZip(template), {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      parser: collector,
      nullGetter: () => '',
    });
    document.render({});
  } catch (cause) {
    throw new TemplateError(explain(cause));
  }
  return [...names].sort();
}
