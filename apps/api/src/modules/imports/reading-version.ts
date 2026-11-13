import type { ImportKind, ImportLibraryPart } from '@ssm-usor/contracts';
import {
  instructionsModel,
  instructionsRequest,
  locatingModel,
  readingAnswer,
  readingModel,
  readingSystemPrompt,
  retypeRequest,
  risksModel,
  risksRequest,
  sheetPageAnswer,
  sheetPageSystemPrompt,
  similarityAnswer,
  similarityModel,
  similaritySystemPrompt,
  sortingAnswer,
  sortingModel,
  sortingSystemPrompt,
} from '@ssm-usor/import';

import { sha256 } from '../../lib/docx';

export interface ReadingVersion {
  // By step, as `usage_by_step` names them.
  models: Record<string, string>;
  prompts: string;
}

export type Reader = ImportKind | ImportLibraryPart;

// The prompts take the provider, the client and the files: these stand in for them, so that the
// hash changes with the prompts' own text and nothing else.
const provider = { name: 'P', cui: '1', people: ['A'] };
const client = { legalName: 'C', cui: '2' };
const file = { path: 'f', text: 't' };

function readerInputs(reader: Reader): { models: Record<string, string>; texts: unknown[] } {
  switch (reader) {
    case 'client':
      return {
        models: { sorting: sortingModel, scanning: readingModel, reading: readingModel },
        texts: [
          sortingSystemPrompt(provider),
          sortingAnswer.jsonSchema,
          readingSystemPrompt(provider),
          readingSystemPrompt(provider, client),
          readingAnswer.jsonSchema,
        ],
      };
    case 'employees':
      return {
        models: { scanning: readingModel, locating: locatingModel },
        texts: [sheetPageSystemPrompt, sheetPageAnswer.jsonSchema],
      };
    case 'risk_evaluations': {
      const input = { files: [file], posts: ['p'] };
      const first = risksRequest(input);
      const retype = retypeRequest(input, [{ heading: 'h' }]);
      return {
        models: { risks: risksModel },
        texts: [
          first.messages,
          first.answer.jsonSchema,
          first.maxCompletionTokens,
          retype.messages,
          retype.answer.jsonSchema,
        ],
      };
    }
    default: {
      const request = instructionsRequest({
        domain: reader === 'instructions_su' ? 'su' : 'ssm',
        instructions: [file],
        themes: [file],
        posts: ['p'],
      });
      return {
        models: { instructions: instructionsModel, similarity: similarityModel },
        texts: [
          request.messages,
          request.answer.jsonSchema,
          request.maxCompletionTokens,
          similaritySystemPrompt,
          similarityAnswer.jsonSchema,
        ],
      };
    }
  }
}

const versions = new Map<Reader, Promise<ReadingVersion>>();

export function readingVersion(reader: Reader): Promise<ReadingVersion> {
  let version = versions.get(reader);
  if (!version) {
    const { models, texts } = readerInputs(reader);
    version = sha256(new TextEncoder().encode(JSON.stringify(texts))).then((hash) => ({
      models,
      prompts: hash.slice(0, 12),
    }));
    versions.set(reader, version);
  }
  return version;
}
