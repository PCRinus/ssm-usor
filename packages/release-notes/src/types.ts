export interface UpdateFeature {
  title: string;
  text: string;
  where: string | null;
  icon: string | null;
}

export interface UpdateSections {
  features: UpdateFeature[];
  improvements: string[];
  fixes: string[];
}

export interface Update extends UpdateSections {
  headline: string;
  lead: string | null;
}

export interface ParseError {
  line: number;
  message: string;
}

export type ReleaseBodyResult =
  | { kind: 'update'; update: Update; source: string }
  | { kind: 'silent' }
  | { kind: 'invalid'; errors: ParseError[] };

export type PullRequestBlockResult =
  | { kind: 'block'; sections: UpdateSections }
  | { kind: 'none' }
  | { kind: 'invalid'; errors: ParseError[] };

export interface ItemCounts {
  features: number;
  improvements: number;
  fixes: number;
}
