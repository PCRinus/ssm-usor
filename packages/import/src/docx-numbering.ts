import { childrenOf, tagOf, type XmlNode } from './docx';

type Level = {
  start: number;
  format: string;
  text: string;
  legal: boolean;
  // One-based level whose use restarts this one; 0 never restarts it. Undefined: any shallower level.
  restartAfter?: number;
  style?: string;
};

type AbstractList = { levels: (Level | undefined)[]; numStyleLink?: string };

type ListInstance = {
  abstractId: string;
  starts: Map<number, number>;
  levels: Map<number, Level>;
};

type Style = { basedOn?: string; numId?: string; level?: number };

export type PrintedNumber = { level: number; label: string };

export type ParagraphNumbering = { numId?: string; level?: number; style?: string };

const maxLevels = 9;

export const attributeOf = (node: XmlNode, name: string) => {
  const attributes = node[':@'] as Record<string, string> | undefined;
  return attributes?.[name];
};

export const childOf = (node: XmlNode, tag: string) =>
  childrenOf(node).find((child) => tagOf(child) === tag);

const valueOf = (node: XmlNode, tag: string) => {
  const child = childOf(node, tag);
  return child ? attributeOf(child, 'w:val') : undefined;
};

const integerOf = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

// "true", "1" and "on" all switch an OOXML flag on, and an empty element does too.
const flagOf = (node: XmlNode, tag: string) => {
  const child = childOf(node, tag);
  if (!child) return false;
  const value = attributeOf(child, 'w:val');
  return value === undefined || value === 'true' || value === '1' || value === 'on';
};

function levelOf(node: XmlNode): Level {
  return {
    start: integerOf(valueOf(node, 'w:start')) ?? 0,
    format: valueOf(node, 'w:numFmt') ?? 'decimal',
    text: valueOf(node, 'w:lvlText') ?? '',
    legal: flagOf(node, 'w:isLgl'),
    restartAfter: integerOf(valueOf(node, 'w:lvlRestart')),
    style: valueOf(node, 'w:pStyle'),
  };
}

const levelIndexOf = (node: XmlNode) => integerOf(attributeOf(node, 'w:ilvl')) ?? 0;

export function numberingPropertiesOf(pPr: XmlNode | undefined): ParagraphNumbering {
  if (!pPr) return {};
  const numPr = childOf(pPr, 'w:numPr');
  return {
    numId: numPr ? valueOf(numPr, 'w:numId') : undefined,
    level: numPr ? integerOf(valueOf(numPr, 'w:ilvl')) : undefined,
    style: valueOf(pPr, 'w:pStyle'),
  };
}

function toRoman(value: number) {
  if (value <= 0 || value >= 4000) return String(value);
  const numerals: [number, string][] = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let rest = value;
  let roman = '';
  for (const [amount, numeral] of numerals) {
    while (rest >= amount) {
      roman += numeral;
      rest -= amount;
    }
  }
  return roman;
}

// Word counts letters past z as aa, bb, cc rather than as a spreadsheet's aa, ab, ac, and stops
// at 780; a file's start value past it would otherwise build a string of any length.
function toLetters(value: number) {
  if (value <= 0 || value > 780) return String(value);
  return String.fromCharCode(97 + ((value - 1) % 26)).repeat(Math.ceil(value / 26));
}

export function formatNumber(value: number, format: string): string {
  switch (format) {
    case 'lowerLetter':
      return toLetters(value);
    case 'upperLetter':
      return toLetters(value).toUpperCase();
    case 'lowerRoman':
      return toRoman(value);
    case 'upperRoman':
      return toRoman(value).toUpperCase();
    case 'decimalZero':
      return value >= 0 && value < 10 ? `0${value}` : String(value);
    case 'none':
    case 'bullet':
      return '';
    default:
      return String(value);
  }
}

// A bullet's character is usually a symbol font's private-use code point, which prints as a glyph
// of that font and reads as nothing in plain text.
function bulletOf(text: string) {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === 'o' || /^[-]+$/.test(trimmed)) return '•';
  if (trimmed === '-') return '–';
  return trimmed;
}

export type Numbering = { next(paragraph: ParagraphNumbering): PrintedNumber | undefined };

export type NumberingDefinitions = { start(): Numbering };

export function readNumbering(
  numberingRoot: XmlNode[] | undefined,
  stylesRoot: XmlNode[] | undefined
): NumberingDefinitions {
  const abstracts = new Map<string, AbstractList>();
  const instances = new Map<string, ListInstance>();
  const styles = new Map<string, Style>();
  let defaultStyle: string | undefined;

  const numberingNode = numberingRoot?.find((node) => tagOf(node) === 'w:numbering');
  for (const node of numberingNode ? childrenOf(numberingNode) : []) {
    const tag = tagOf(node);
    if (tag === 'w:abstractNum') {
      const id = attributeOf(node, 'w:abstractNumId');
      if (id === undefined) continue;
      const levels: (Level | undefined)[] = [];
      for (const level of childrenOf(node).filter((child) => tagOf(child) === 'w:lvl')) {
        const index = levelIndexOf(level);
        if (index < maxLevels) levels[index] = levelOf(level);
      }
      abstracts.set(id, { levels, numStyleLink: valueOf(node, 'w:numStyleLink') });
    } else if (tag === 'w:num') {
      const id = attributeOf(node, 'w:numId');
      const abstractId = valueOf(node, 'w:abstractNumId');
      if (id === undefined || abstractId === undefined) continue;
      const instance: ListInstance = { abstractId, starts: new Map(), levels: new Map() };
      for (const override of childrenOf(node).filter((child) => tagOf(child) === 'w:lvlOverride')) {
        const index = levelIndexOf(override);
        const start = integerOf(valueOf(override, 'w:startOverride'));
        const level = childOf(override, 'w:lvl');
        if (level) instance.levels.set(index, levelOf(level));
        if (start !== undefined) instance.starts.set(index, start);
        else if (level) instance.starts.set(index, levelOf(level).start);
      }
      instances.set(id, instance);
    }
  }

  const stylesNode = stylesRoot?.find((node) => tagOf(node) === 'w:styles');
  for (const node of stylesNode ? childrenOf(stylesNode) : []) {
    if (tagOf(node) !== 'w:style' || attributeOf(node, 'w:type') !== 'paragraph') continue;
    const id = attributeOf(node, 'w:styleId');
    if (id === undefined) continue;
    const pPr = childOf(node, 'w:pPr');
    const numPr = pPr ? childOf(pPr, 'w:numPr') : undefined;
    styles.set(id, {
      basedOn: valueOf(node, 'w:basedOn'),
      numId: numPr ? valueOf(numPr, 'w:numId') : undefined,
      level: numPr ? integerOf(valueOf(numPr, 'w:ilvl')) : undefined,
    });
    const isDefault = attributeOf(node, 'w:default');
    if (isDefault === '1' || isDefault === 'true') defaultStyle = id;
  }

  const styleNumbering = (styleId: string | undefined) => {
    let numId: string | undefined;
    let level: number | undefined;
    const seen = new Set<string>();
    for (let id = styleId; id !== undefined && !seen.has(id); id = styles.get(id)?.basedOn) {
      seen.add(id);
      const style = styles.get(id);
      if (!style) break;
      numId ??= style.numId;
      level ??= style.level;
      if (numId !== undefined && level !== undefined) break;
    }
    return { numId, level };
  };

  // A list whose definition only points at a numbering style takes its levels from the list that
  // style numbers with, and counts with it.
  const abstractIdOf = (instance: ListInstance) => {
    let id = instance.abstractId;
    const seen = new Set<string>();
    while (!seen.has(id)) {
      seen.add(id);
      const link = abstracts.get(id)?.numStyleLink;
      if (link === undefined) break;
      const linkedNum = styleNumbering(link).numId;
      const linked = linkedNum === undefined ? undefined : instances.get(linkedNum);
      if (!linked) break;
      id = linked.abstractId;
    }
    return id;
  };

  const start = (): Numbering => {
    const counters = new Map<string, (number | undefined)[]>();
    const startedInstances = new Set<string>();

    return {
      next(paragraph) {
        const style = paragraph.style ?? defaultStyle;
        const inherited = styleNumbering(style);
        const numId = paragraph.numId ?? inherited.numId;
        if (numId === undefined || numId === '0') return undefined;
        const instance = instances.get(numId);
        if (!instance) return undefined;
        const abstractId = abstractIdOf(instance);
        const abstract = abstracts.get(abstractId);
        if (!abstract) return undefined;
        const levelAt = (index: number) => instance.levels.get(index) ?? abstract.levels[index];
        const styledLevel =
          paragraph.numId === undefined && style !== undefined
            ? abstract.levels.findIndex((level) => level?.style === style)
            : -1;
        const index = Math.min(
          paragraph.level ?? inherited.level ?? (styledLevel >= 0 ? styledLevel : 0),
          maxLevels - 1
        );
        const level = levelAt(index);
        if (!level) return undefined;

        const startOf = (at: number) => instance.starts.get(at) ?? levelAt(at)?.start ?? 0;
        let values = counters.get(abstractId);
        if (!values) {
          values = [];
          counters.set(abstractId, values);
        }
        // Word restarts the levels a list instance overrides when that instance is first used, and
        // then counts on with the other instances of the same list.
        if (!startedInstances.has(numId)) {
          startedInstances.add(numId);
          for (const at of instance.starts.keys()) values[at] = undefined;
        }
        // An item below levels not yet used counts them as used once, so the next item at one of
        // them prints its second number, as Word and LibreOffice print it.
        for (let shallower = 0; shallower < index; shallower++) {
          values[shallower] ??= startOf(shallower);
        }
        const current = values[index];
        values[index] = current === undefined ? startOf(index) : current + 1;
        for (let deeper = index + 1; deeper < maxLevels; deeper++) {
          const restartAfter = levelAt(deeper)?.restartAfter;
          if (restartAfter === undefined || (restartAfter !== 0 && index < restartAfter)) {
            values[deeper] = undefined;
          }
        }

        const label =
          level.format === 'bullet'
            ? bulletOf(level.text)
            : level.text
                .replace(/%([1-9])/g, (_, digit: string) => {
                  const at = Number(digit) - 1;
                  const shown = levelAt(at);
                  const value = values[at] ?? startOf(at);
                  const format =
                    level.legal && at < index ? 'decimal' : (shown?.format ?? 'decimal');
                  return formatNumber(value, format);
                })
                .trim();
        return label === '' ? undefined : { level: index, label };
      },
    };
  };

  return { start };
}
