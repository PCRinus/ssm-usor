// Not the package root, which loads React: this map's keys are the names DynamicIcon renders,
// and reading them loads no icon.
import dynamicIconImports from 'lucide-react/dynamicIconImports.mjs';

const iconNames = new Set(Object.keys(dynamicIconImports));

export function isLucideIcon(name: string): boolean {
  return iconNames.has(name);
}
