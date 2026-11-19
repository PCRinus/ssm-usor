import { describe, expect, it } from 'vitest';

import { trainingIssueTarget } from './training-form-schema';

describe('trainingIssueTarget', () => {
  it('words the issues the API words itself, in Romanian', () => {
    expect(trainingIssueTarget('employeeIds')).toEqual({
      field: 'employeeIds',
      message:
        'Un participant nu mai este lucrător al clientului. Reîncarcă lista și alege din nou.',
    });
    expect(trainingIssueTarget('heldOn')).toEqual({
      field: 'heldOn',
      message: 'O instruire se înregistrează după ce a avut loc.',
    });
  });

  it('names the form field of a request path and leaves the wording to the caller', () => {
    expect(trainingIssueTarget('trainer.jobTitle')).toEqual({
      field: 'trainerJobTitle',
      message: undefined,
    });
    expect(trainingIssueTarget('signers.admitter')).toEqual({
      field: 'admitterSignerId',
      message: undefined,
    });
  });

  it('has no field for a path the form does not show', () => {
    expect(trainingIssueTarget('themesRevisionId')).toBeUndefined();
    expect(trainingIssueTarget('clientId')).toBeUndefined();
  });
});
