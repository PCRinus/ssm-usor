import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

import type { DiffRun } from './spelling-diff';

const phoneCharacters = /^\+?[0-9\s.()/-]+$/;

export function formatPhone(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!phoneCharacters.test(text)) return text;
  const phone = parsePhoneNumberFromString(text, { defaultCountry: 'RO' });
  if (phone?.isValid()) {
    return phone.country === 'RO' ? phone.formatNational() : phone.formatInternational();
  }
  const digits = text.replace(/\D/g, '');
  if (/^0[23]1\d{7}$/.test(digits)) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (/^0\d{9}$/.test(digits)) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return text;
}

// Numbers of one length differ where a digit was mistyped or two swapped, which reads best place
// by place; otherwise the digits outside their longest common run are the ones added or left out.
function differingDigits(a: string, b: string): [boolean[], boolean[]] {
  if (a.length === b.length) {
    const marks = [...a].map((digit, index) => digit !== b[index]);
    return [marks, [...marks]];
  }
  const width = b.length + 1;
  const lcs = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }
  const inA = [...a].map(() => true);
  const inB = [...b].map(() => true);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      inA[i++] = false;
      inB[j++] = false;
    } else if (lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!) i++;
    else j++;
  }
  return [inA, inB];
}

function markedRuns(text: string, marks: boolean[]): DiffRun[] {
  const chars = [...text];
  let digit = 0;
  const flags = chars.map((char) => (/\d/.test(char) ? (marks[digit++] ?? false) : null));
  const runs: DiffRun[] = [];
  chars.forEach((char, index) => {
    const changed =
      flags[index] ??
      (Boolean(
        flags
          .slice(0, index)
          .reverse()
          .find((flag) => flag !== null)
      ) &&
        Boolean(flags.slice(index + 1).find((flag) => flag !== null)));
    const last = runs.at(-1);
    if (last && last.changed === changed) last.text += char;
    else runs.push({ text: char, changed });
  });
  return runs;
}

export function phoneDiff(values: string[]): DiffRun[][] {
  const shown = values.map(formatPhone);
  const digits = shown.map((text) => text.replace(/\D/g, ''));
  const marks = digits.map((each) => [...each].map(() => false));
  for (let a = 0; a < digits.length; a++) {
    for (let b = a + 1; b < digits.length; b++) {
      const [inA, inB] = differingDigits(digits[a]!, digits[b]!);
      inA.forEach((marked, index) => (marks[a]![index] ||= marked));
      inB.forEach((marked, index) => (marks[b]![index] ||= marked));
    }
  }
  return shown.map((text, index) => markedRuns(text, marks[index]!));
}
