import { Routes } from '@angular/router';
import { CountryExplorer } from './features/countries/pages/country-explorer';
export const routes: Routes = [
  { path: '', pathMatch: 'full', component: CountryExplorer, title: 'Razišči države · Country Explorer' },
  { path: 'countries/:code', title: 'Podatki o državi · Country Explorer',
    loadComponent: () => import('./features/countries/pages/country-detail').then(m => m.CountryDetail) },
  { path: '**', title: 'Stran ni najdena · Country Explorer',
    loadComponent: () => import('./core/layout/not-found-page').then(m => m.NotFoundPage) },
];
