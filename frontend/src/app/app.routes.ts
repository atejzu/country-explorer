import { Routes } from '@angular/router';
import { FoundationPage } from './core/layout/foundation-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: FoundationPage },
  {
    path: '**',
    loadComponent: () => import('./core/layout/not-found-page').then((m) => m.NotFoundPage),
  },
];
