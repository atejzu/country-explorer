import { CountryDetail, CountrySummary } from './country';
export const summary: CountrySummary = {
  code: 'SVN', name: 'Slovenija', capital: 'Ljubljana', population: 2100000, region: 'Europe',
  flag: { png: '/test-flag.png', svg: '/test-flag.svg', alt: 'Zastava države Slovenija' },
};
export const detail: CountryDetail = {
  ...summary, officialName: 'Republika Slovenija', capital: ['Ljubljana'], area: 20273,
  populationDensity: 103.59, subregion: 'Central Europe',
  currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }], languages: [{ code: 'slv', name: 'Slovene' }],
  timezones: ['UTC+01:00'], borders: ['AUT', 'HRV'], callingCodes: ['+386'], drivingSide: 'right',
  coordinates: { latitude: 46.1167, longitude: 14.8167 },
};
