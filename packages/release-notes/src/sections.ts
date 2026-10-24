import {
  emptySections,
  foldKey,
  iconLabel,
  type Line,
  type SectionKey,
  sectionTitles,
  whereLabel,
} from './dialect.js';
import { isLucideIcon } from './icons.js';
import type { ParseError, UpdateSections } from './types.js';

interface FeatureDraft {
  line: number;
  title: string;
  text: string[];
  where: string | null;
  icon: string | null;
}

export class SectionCollector {
  readonly sections: UpdateSections = emptySections();
  readonly errors: ParseError[] = [];
  private current: SectionKey | 'unknown' | null = null;
  private feature: FeatureDraft | null = null;
  private readonly opened = new Map<SectionKey, number>();

  get started(): boolean {
    return this.current !== null;
  }

  open(section: SectionKey, line: number): void {
    this.closeFeature();
    const first = this.opened.get(section);
    if (first !== undefined) {
      this.error(
        line,
        `## ${sectionTitles[section]} appears twice; the first is on line ${first}.`
      );
    } else {
      this.opened.set(section, line);
    }
    this.current = section;
  }

  openUnknown(): void {
    this.closeFeature();
    this.current = 'unknown';
  }

  accept(line: Line): void {
    const { token } = line;
    if (token.kind === 'blank' || token.kind === 'fenced' || this.current === 'unknown') return;
    if (token.kind === 'fence') {
      this.error(line.number, 'A code block is not part of an update.');
      return;
    }
    if (this.current === 'features') this.acceptFeatureLine(line);
    else if (this.current !== null) this.acceptListLine(line, this.current);
  }

  finish(): void {
    this.closeFeature();
  }

  private acceptFeatureLine(line: Line): void {
    const { token } = line;
    if (token.kind === 'heading') {
      if (token.level !== 3) {
        this.error(line.number, 'Under ## Ce e nou, a feature starts with a ### heading.');
        return;
      }
      this.closeFeature();
      if (token.title === '') this.error(line.number, 'The feature has no title after ###.');
      this.feature = { line: line.number, title: token.title, text: [], where: null, icon: null };
      return;
    }
    if (this.feature === null) {
      this.error(line.number, 'Text under ## Ce e nou must follow a ### feature title.');
      return;
    }
    if (token.kind === 'item') {
      this.error(
        line.number,
        'A list item inside a feature; improvements and fixes go under ## Îmbunătățiri or ## Remedieri.'
      );
      return;
    }
    if (token.kind !== 'text') return;
    const key = foldKey(token.text);
    if (key.startsWith(whereLabel)) {
      this.setWhere(line.number, token.text.slice(whereLabel.length).trim());
    } else if (key.startsWith(iconLabel)) {
      this.setIcon(line.number, token.text.slice(iconLabel.length).trim());
    } else {
      this.feature.text.push(token.text);
    }
  }

  private setWhere(line: number, where: string): void {
    const feature = this.feature!;
    if (feature.where !== null) this.error(line, `A second "${whereLabel}" line in the feature.`);
    else if (where === '') this.error(line, `"${whereLabel}" names no place.`);
    else feature.where = where;
  }

  private setIcon(line: number, icon: string): void {
    const feature = this.feature!;
    if (feature.icon !== null) this.error(line, `A second "${iconLabel}" line in the feature.`);
    else if (icon === '') this.error(line, `"${iconLabel}" names no icon.`);
    else if (!isLucideIcon(icon)) this.error(line, `"${icon}" is not a lucide icon name.`);
    else feature.icon = icon;
  }

  private acceptListLine(line: Line, section: 'improvements' | 'fixes'): void {
    const { token } = line;
    if (token.kind === 'item') {
      if (token.text === '') this.error(line.number, 'The list item is empty.');
      else this.sections[section].push(token.text);
      return;
    }
    this.error(
      line.number,
      `## ${sectionTitles[section]} holds only list items, each a line starting with "- ".`
    );
  }

  private closeFeature(): void {
    const feature = this.feature;
    if (feature === null) return;
    this.feature = null;
    if (feature.text.length === 0) {
      this.error(feature.line, `The feature "${feature.title}" has no text.`);
      return;
    }
    if (feature.title === '') return;
    this.sections.features.push({
      title: feature.title,
      text: feature.text.join(' '),
      where: feature.where,
      icon: feature.icon,
    });
  }

  private error(line: number, message: string): void {
    this.errors.push({ line, message });
  }
}
