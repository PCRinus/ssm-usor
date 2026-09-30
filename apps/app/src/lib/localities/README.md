# Localities

`data/<county code>.json` lists the localities of each county as `[name, parent]` pairs, the
parent being the commune, town or municipality the locality belongs to.

The files are generated, not edited: `node scripts/generate-localities.mjs <siruta.csv>`.

Source: SIRUTA (Sistemul Informatic al Registrului Unităților Teritorial-Administrative),
2026 edition, © Institutul Național de Statistică, published on
[data.gov.ro](https://data.gov.ro/dataset?q=siruta) under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Names were converted from capitals
to title case and to the comma-below forms of ș and ț.
