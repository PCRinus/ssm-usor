import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import type { MissingSheetData } from '@ssm-usor/contracts';

import { intlLocaleOf } from '@/lib/format';
import { missingSheetDataMessages } from '@/lib/labels';

export function useMissingSheetDataSentence() {
  const { t, i18n } = useLingui();
  return (missing: MissingSheetData[]) => {
    const count = missing.length;
    const items = new Intl.ListFormat(intlLocaleOf(i18n.locale), { type: 'conjunction' }).format(
      missing.map((item) => i18n._(missingSheetDataMessages[item]))
    );
    return t({
      message: plural(count, {
        one: `Fișa nu poate fi întocmită încă: lipsește ${items}; spune-i specialistului.`,
        few: `Fișa nu poate fi întocmită încă: lipsesc ${items}; spune-i specialistului.`,
        other: `Fișa nu poate fi întocmită încă: lipsesc ${items}; spune-i specialistului.`,
      }),
    });
  };
}
