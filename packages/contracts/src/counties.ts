import { z } from 'zod';

// Romanian counties keyed by vehicle registration code. ANAF returns the same code
// (scod_JudetAuto), so lookups map onto this list without name matching.
export const romanianCounties = [
  { code: 'AB', name: 'Alba' },
  { code: 'AR', name: 'Arad' },
  { code: 'AG', name: 'Argeș' },
  { code: 'BC', name: 'Bacău' },
  { code: 'BH', name: 'Bihor' },
  { code: 'BN', name: 'Bistrița-Năsăud' },
  { code: 'BT', name: 'Botoșani' },
  { code: 'BV', name: 'Brașov' },
  { code: 'BR', name: 'Brăila' },
  { code: 'B', name: 'București' },
  { code: 'BZ', name: 'Buzău' },
  { code: 'CS', name: 'Caraș-Severin' },
  { code: 'CL', name: 'Călărași' },
  { code: 'CJ', name: 'Cluj' },
  { code: 'CT', name: 'Constanța' },
  { code: 'CV', name: 'Covasna' },
  { code: 'DB', name: 'Dâmbovița' },
  { code: 'DJ', name: 'Dolj' },
  { code: 'GL', name: 'Galați' },
  { code: 'GR', name: 'Giurgiu' },
  { code: 'GJ', name: 'Gorj' },
  { code: 'HR', name: 'Harghita' },
  { code: 'HD', name: 'Hunedoara' },
  { code: 'IL', name: 'Ialomița' },
  { code: 'IS', name: 'Iași' },
  { code: 'IF', name: 'Ilfov' },
  { code: 'MM', name: 'Maramureș' },
  { code: 'MH', name: 'Mehedinți' },
  { code: 'MS', name: 'Mureș' },
  { code: 'NT', name: 'Neamț' },
  { code: 'OT', name: 'Olt' },
  { code: 'PH', name: 'Prahova' },
  { code: 'SM', name: 'Satu Mare' },
  { code: 'SJ', name: 'Sălaj' },
  { code: 'SB', name: 'Sibiu' },
  { code: 'SV', name: 'Suceava' },
  { code: 'TR', name: 'Teleorman' },
  { code: 'TM', name: 'Timiș' },
  { code: 'TL', name: 'Tulcea' },
  { code: 'VS', name: 'Vaslui' },
  { code: 'VL', name: 'Vâlcea' },
  { code: 'VN', name: 'Vrancea' },
] as const;

export const countyCodes = romanianCounties.map((county) => county.code) as [
  (typeof romanianCounties)[number]['code'],
  ...(typeof romanianCounties)[number]['code'][],
];

export const countyCodeSchema = z.enum(countyCodes);

export type CountyCode = z.infer<typeof countyCodeSchema>;

export const countyNames: Record<CountyCode, string> = Object.fromEntries(
  romanianCounties.map((county) => [county.code, county.name])
) as Record<CountyCode, string>;
