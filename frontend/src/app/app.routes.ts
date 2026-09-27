import { Routes } from '@angular/router';
import { CountryExplorer } from './features/countries/pages/country-explorer';
import { anonymousGuard, authGuard } from './core/auth/auth-guard';
export const routes: Routes = [
  { path: '', pathMatch: 'full', component: CountryExplorer, title: 'Razišči države · Country Explorer' },
  { path: 'countries/:code', title: 'Podatki o državi · Country Explorer',
    loadComponent: () => import('./features/countries/pages/country-detail').then(m => m.CountryDetail) },
  { path: 'discussions/:discussionId', title: 'Razprava · Country Explorer',
    loadComponent: () => import('./features/community/pages/discussion-page').then(m => m.DiscussionPage) },
  { path: 'login', title: 'Prijava · Country Explorer', canActivate: [anonymousGuard],
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login) },
  { path: 'register', title: 'Ustvari račun · Country Explorer', canActivate: [anonymousGuard],
    loadComponent: () => import('./features/auth/register/register').then(m => m.Register) },
  { path: 'favorites', title: 'Priljubljene · Country Explorer', canActivate: [authGuard],
    loadComponent: () => import('./features/favorites/favorites-page/favorites-page').then(m => m.FavoritesPage) },
  { path: 'account', title: 'Račun · Country Explorer', canActivate: [authGuard],
    loadComponent: () => import('./features/account/account-page/account-page').then(m => m.AccountPage) },
  { path: '**', title: 'Stran ni najdena · Country Explorer',
    loadComponent: () => import('./core/layout/not-found-page').then(m => m.NotFoundPage) },
];
