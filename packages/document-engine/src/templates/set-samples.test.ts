import { describe, expect, it } from 'vitest';

import { setSamples } from '../../tools/set-samples';
import { renderDocument } from '../render';
import { documentText } from '../text';
import { entries, questionsOf, read } from './read';

const setTemplates = entries
  .filter((entry) => entry.set !== 'other' && !entry.perEmployee)
  .map((entry) => entry.path);

describe.each(setSamples)('the $label sample of the sets', ({ data }) => {
  it.each(setTemplates)('fills every field of %s', (path) => {
    const text = documentText(renderDocument(read(path), { ...data, ...questionsOf(path) }));
    expect(text).not.toContain('{{');
  });
});
