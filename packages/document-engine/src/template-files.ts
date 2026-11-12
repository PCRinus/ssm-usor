import fire from '../templates/fire/manifest.json' with { type: 'json' };
import ssm from '../templates/manifest.json' with { type: 'json' };
import other from '../templates/other/manifest.json' with { type: 'json' };

export interface TemplateOfFile {
  typeKey: string;
  title: string;
}

// Keyed as the citation index names a file, by its path under templates/.
const byFile = new Map<string, TemplateOfFile>(
  (
    [
      ['', ssm.templates],
      ['fire/', fire.templates],
      ['other/', other.templates],
    ] as const
  ).flatMap(([folder, templates]) =>
    templates.flatMap((entry: { file?: string; typeKey: string; title: string }) =>
      entry.file
        ? [[`${folder}${entry.file}`, { typeKey: entry.typeKey, title: entry.title }] as const]
        : []
    )
  )
);

export function templateOfFile(file: string): TemplateOfFile | null {
  return byFile.get(file) ?? null;
}
