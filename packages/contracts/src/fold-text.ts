const marks = /\p{M}/gu;

export function foldText(value: string) {
  return value
    .normalize('NFD')
    .toLowerCase()
    .replace(marks, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
