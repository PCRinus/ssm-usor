import { describe, expect, it } from 'vitest';

import { missingDocumentData } from './context';
import { facts } from './context.fixture';
import {
  buildFireSafetyContext,
  fireSafetyGapConcerns,
  missingFireSafetyData,
} from './fire-safety';
import { setOfGroup, setRules } from './sets';

describe('what the fire-safety set is missing', () => {
  it('is nothing for complete facts', () => {
    expect(missingFireSafetyData(facts)).toEqual([]);
  });

  it('is only what its documents print, in the order of the form', () => {
    const lacking = {
      ...facts,
      organization: {
        legalName: ' ',
        representativeName: null,
        representativeRole: null,
        fireSafetyTechnicianName: null,
      },
      specialist: null,
      client: { ...facts.client, representativeName: null, representativeRole: '', caenCode: null },
      responsiblePersons: [],
      jobPositions: [],
      riskEvaluations: [],
    };
    expect(missingFireSafetyData(lacking)).toEqual([
      'provider.legalName',
      'provider.fireSafetyTechnician',
      'client.representativeName',
      'client.representativeRole',
    ]);
  });

  it('never holds back the occupational safety set, nor is held back by it', () => {
    const withoutTechnician = {
      ...facts,
      organization: { ...facts.organization, fireSafetyTechnicianName: '  ' },
    };
    expect(missingDocumentData(withoutTechnician)).toEqual([]);
    const occupationalGaps: typeof facts = { ...facts, jobPositions: [], responsiblePersons: [] };
    expect(missingDocumentData(occupationalGaps)).not.toEqual([]);
    expect(missingFireSafetyData(occupationalGaps)).toEqual([]);
  });
});

describe('the fire-safety context', () => {
  it('holds the client, the provider, the technician, the date and the branding switch', () => {
    expect(buildFireSafetyContext(facts)).toEqual({
      branding: true,
      issueDate: '19.01.2026',
      client: {
        legalName: 'S.C. PIPETECH S.R.L.',
        representativeName: 'Florin Cristian TALOȘ',
        representativeRole: 'Administrator',
      },
      provider: {
        legalName: 'S.C. SERVICIU EXTERN DEMO S.R.L.',
        representativeName: 'Ana IONESCU',
        representativeRole: 'Administrator',
      },
      fireSafetyTechnician: { name: 'Radu STAN' },
    });
  });

  it('keeps the shape of the provider without its representative, which no document prints', () => {
    const context = buildFireSafetyContext({
      ...facts,
      branding: false,
      organization: {
        ...facts.organization,
        representativeName: null,
        representativeRole: null,
        fireSafetyTechnicianName: '  Radu STAN ',
      },
    });
    expect(context.provider).toEqual({
      legalName: 'S.C. SERVICIU EXTERN DEMO S.R.L.',
      representativeName: '',
      representativeRole: '',
    });
    expect(context.fireSafetyTechnician).toEqual({ name: 'Radu STAN' });
    expect(context.branding).toBe(false);
  });

  it('refuses to be built with something missing', () => {
    expect(() =>
      buildFireSafetyContext({
        ...facts,
        organization: { ...facts.organization, fireSafetyTechnicianName: null },
      })
    ).toThrow(/provider\.fireSafetyTechnician/);
  });

  it('is what a fire-safety template is merged with, whatever the type or number', () => {
    expect(setRules.fire_safety.data(facts, 'fire_registers', 4)).toEqual(
      buildFireSafetyContext(facts)
    );
  });
});

describe('a gap in the fire-safety data', () => {
  it('concerns a document that printed the name it is in', () => {
    expect(fireSafetyGapConcerns('provider.fireSafetyTechnician', ['fireSafetyTechnician'])).toBe(
      true
    );
    expect(fireSafetyGapConcerns('provider.fireSafetyTechnician', ['client', 'branding'])).toBe(
      false
    );
    expect(fireSafetyGapConcerns('client.representativeRole', ['client'])).toBe(true);
    expect(fireSafetyGapConcerns('provider.legalName', ['branding'])).toBe(false);
  });
});

describe('setOfGroup', () => {
  it('names the set of a group, and none for other documents', () => {
    expect(setOfGroup('documentation_set')).toBe('occupational_safety');
    expect(setOfGroup('fire_safety_set')).toBe('fire_safety');
    expect(setOfGroup('other')).toBeNull();
  });
});
