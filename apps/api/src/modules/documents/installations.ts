import { type FireInstallationKind, fireInstallationKindLabels } from '@ssm-usor/contracts';

const comparable = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLocaleLowerCase('ro')
    .replace(/\s+/g, ' ')
    .trim();

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase('ro') + text.slice(1);

/** "2 hidranți interiori Dn 50" names its kind; "Unul pe nivel" does not. */
export function descriptionNamesKind(kind: FireInstallationKind, description: string) {
  const label = comparable(fireInstallationKindLabels[kind]);
  return comparable(description)
    .replace(/^\d+\s+/, '')
    .startsWith(label);
}

/**
 * How a list prints an installation: its kind and its description, or the description alone
 * where it already names the kind, so that no row reads "Hidranți interiori – 2 hidranți
 * interiori". An installation of another kind is its description.
 */
export function installationParts(kind: FireInstallationKind, description: string | null) {
  const text = description?.trim() ?? '';
  if (text && (kind === 'other' || descriptionNamesKind(kind, text))) {
    return { kindLabel: capitalized(text), description: '' };
  }
  return { kindLabel: fireInstallationKindLabels[kind], description: text };
}

export function installationText(kind: FireInstallationKind, description: string | null) {
  const parts = installationParts(kind, description);
  return parts.description ? `${parts.kindLabel} – ${parts.description}` : parts.kindLabel;
}
