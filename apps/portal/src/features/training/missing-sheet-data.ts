import { type MissingSheetData, missingSheetDataLabels } from '@ssm-usor/contracts';

export function missingSheetDataSentence(missing: MissingSheetData[]) {
  const labels = missing.map((item) => missingSheetDataLabels[item]);
  const verb = labels.length > 1 ? 'lipsesc' : 'lipsește';
  return `Fișa nu poate fi întocmită încă: ${verb} ${labels.join(' și ')}; spune-i specialistului.`;
}
