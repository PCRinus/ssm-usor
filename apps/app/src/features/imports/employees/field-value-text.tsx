import { commuteMeanLabels } from '@ssm-usor/contracts';

import { Shaped } from '@/components/replay';

import type { FieldName } from './employee-review-model';
import { fieldReplay } from './person-values';

const listedMeans = new Set<string>(Object.values(commuteMeanLabels));

export function FieldValueText({ name, text }: { name: FieldName; text: string | null }) {
  if (text === null) return null;
  if (name !== 'commuteMeans') return <span {...fieldReplay(name)}>{text}</span>;
  return text
    .split(/(, |; )/)
    .map((part, index) =>
      index % 2 === 1 || listedMeans.has(part) ? part : <Shaped key={index}>{part}</Shaped>
    );
}
