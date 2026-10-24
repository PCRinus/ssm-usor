import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

const docs = fileURLToPath(new URL('./src/content/docs/', import.meta.url));
const article = /\.mdx?$/;

function entries(directory) {
  try {
    return readdirSync(docs + directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function hasArticles(directory) {
  return entries(directory).some((entry) =>
    entry.isDirectory()
      ? hasArticles(`${directory}/${entry.name}`)
      : entry.isFile() && article.test(entry.name)
  );
}

function slugOf(path) {
  return path.replace(article, '').replace(/(^|\/)index$/, '');
}

// Starlight autogenerates a group from a directory whether or not it holds articles, and labels
// nested directories by their name, so empty groups are dropped and nested ones are labelled here.
function group(label, directory, subgroups = []) {
  const children = subgroups
    .filter((subgroup) => hasArticles(`${directory}/${subgroup.directory}`))
    .map((subgroup) => ({
      label: subgroup.label,
      items: [{ autogenerate: { directory: `${directory}/${subgroup.directory}` } }],
    }));
  if (!children.length) {
    return hasArticles(directory) ? [{ label, items: [{ autogenerate: { directory } }] }] : [];
  }
  const articles = entries(directory)
    .filter((entry) => entry.isFile() && article.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => slugOf(`${directory}/${name}`));
  return [{ label, items: [...articles, ...children] }];
}

const sidebar = [
  ...group('Primii pași', 'primii-pasi'),
  ...group('Clienți', 'clienti', [
    { label: 'Date firmă', directory: 'date-firma' },
    { label: 'Angajați', directory: 'angajati' },
    { label: 'Posturi și echipament', directory: 'posturi' },
    { label: 'Evaluarea riscurilor', directory: 'evaluarea-riscurilor' },
    { label: 'Documente SSM', directory: 'documente-ssm' },
    { label: 'Documente PSI', directory: 'documente-psi' },
    { label: 'Fișiere', directory: 'fisiere' },
  ]),
  ...group('Instrucțiuni', 'instructiuni'),
  ...group('Riscuri', 'riscuri'),
  ...group('Teste', 'teste'),
  ...group('Semnături și participanți', 'semnaturi'),
  ...group('Legislație', 'legislatie'),
  ...group('Organizație', 'organizatie'),
  ...group('Contul meu', 'contul-meu'),
  ...group('Cum funcționează', 'cum-functioneaza'),
];

export default defineConfig({
  output: 'static',
  integrations: [
    starlight({
      title: 'SSM Ușor — Ajutor',
      defaultLocale: 'root',
      locales: { root: { label: 'Română', lang: 'ro' } },
      favicon: '/brand/favicon.png',
      customCss: ['./src/styles/theme.css'],
      sidebar,
    }),
  ],
});
