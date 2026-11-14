import { describe, expect, it } from 'vitest';

import {
  countOf,
  type Proposal,
  proposalMaterial,
  proposalTitle,
  proposedTraining,
} from './supplementary-proposals';

const post = (jobPositionId: string, name: string, recordedOn: string | null = null) => ({
  jobPositionId,
  name,
  workerCount: 2,
  recordedOn,
});

const proposal: Proposal = {
  revisionId: '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d',
  domain: 'su',
  documentTitle: 'Instrucțiuni proprii în domeniul situațiilor de urgență',
  revision: 3,
  firstIssue: false,
  documentDate: '2026-11-12',
  issuedAt: '2026-11-12T09:00:00+00:00',
  posts: [post('p1', 'Zidar', '2026-11-13'), post('p2', 'Fierar betonist'), post('p3', 'Paznic')],
};

describe('a proposed supplementary training', () => {
  it('says the instructions were issued, and issued again after the first issue', () => {
    expect(proposalTitle({ domain: 'ssm', firstIssue: true })).toBe(
      'Instrucțiunile proprii SSM au fost emise'
    );
    expect(proposalTitle({ domain: 'su', firstIssue: false })).toBe(
      'Instrucțiunile proprii SU au fost emise din nou'
    );
  });

  it('cites the instructions by name, revision and date as its material, without articles', () => {
    expect(proposalMaterial(proposal)).toBe(
      'Instrucțiuni proprii în domeniul situațiilor de urgență, rev. 3 din 12.11.2026'
    );
  });

  it("counts the post among all the proposal's and lists the posts still waiting after it", () => {
    expect(proposedTraining(proposal, proposal.posts[1]!)).toEqual({
      key: `${proposal.revisionId}:p2`,
      jobPositionId: 'p2',
      material: proposalMaterial(proposal),
      number: 2,
      total: 3,
      next: ['Paznic'],
    });
  });

  it('says one in words and counts the rest as Romanian does', () => {
    expect(countOf(1, 'lucrător', 'lucrători')).toBe('un lucrător');
    expect(countOf(4, 'lucrător', 'lucrători')).toBe('4 lucrători');
    expect(countOf(21, 'post', 'posturi')).toBe('21 de posturi');
  });
});
