import { describe, expect, it } from 'vitest';

import { citationIndex } from './citation-index';
import { templateOfFile, templateOfType } from './template-files';

describe('templateOfFile', () => {
  it('names the document type of every file the citation index cites', () => {
    for (const citation of citationIndex()) {
      expect(templateOfFile(citation.file)).toEqual({
        typeKey: citation.typeKey,
        title: expect.any(String),
      });
    }
  });

  it('reads a fire-safety file under its folder', () => {
    expect(templateOfFile('fire/1.1_fire_decision_organization.docx')).toEqual({
      typeKey: 'fire_decision_organization',
      title: 'Decizia privind organizarea apărării împotriva incendiilor',
    });
    expect(templateOfFile('2.2_general_training_material.docx')?.title).toBe(
      'Material de instruire introductiv-generală'
    );
  });

  it('knows no file outside the manifests', () => {
    expect(templateOfFile('missing.docx')).toBeNull();
  });
});

describe('templateOfType', () => {
  it('names a document type by its key', () => {
    expect(templateOfType('fire_decision_organization')).toEqual({
      typeKey: 'fire_decision_organization',
      title: 'Decizia privind organizarea apărării împotriva incendiilor',
    });
  });

  it('knows no type outside the manifests', () => {
    expect(templateOfType('missing')).toBeNull();
  });
});
