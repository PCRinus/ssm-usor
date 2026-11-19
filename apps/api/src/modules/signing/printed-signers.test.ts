import { describe, expect, it } from 'vitest';

import { resultExaminer } from './printed-signers';

describe("a test result's examiner", () => {
  it('is the name with the function, or none for a result without one', () => {
    expect(
      resultExaminer({ examiner_name: 'Ana RUS', examiner_job_title: 'Inspector SSM' })
    ).toEqual({ name: 'Ana RUS', jobTitle: 'Inspector SSM' });
    expect(resultExaminer({ examiner_name: null, examiner_job_title: null })).toBeNull();
  });
});
