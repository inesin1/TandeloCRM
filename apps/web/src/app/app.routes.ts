import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'desktop',
  },
  {
    path: 'desktop',
    title: 'Desktop',
    loadComponent: () =>
      import('../pages/desktop-page/desktop-page').then((m) => m.DesktopPage),
  },
  {
    path: 'leads',
    title: 'Leads',
    loadComponent: () =>
      import('../pages/leads-page/leads-page').then((m) => m.LeadsPage),
  },
  {
    path: 'contacts',
    title: 'Contacts',
    loadComponent: () =>
      import('../pages/contacts-page/contacts-page').then(
        (m) => m.ContactsPage,
      ),
  },
  {
    path: 'companies',
    title: 'Companies',
    loadComponent: () =>
      import('../pages/companies-page/companies-page').then(
        (m) => m.CompaniesPage,
      ),
  },
  {
    path: 'tasks',
    title: 'Tasks',
    loadComponent: () =>
      import('../pages/tasks-page/tasks-page').then((m) => m.TasksPage),
  },
  {
    path: 'analytics',
    title: 'Analytics',
    loadComponent: () =>
      import('../pages/analytics-page/analytics-page').then(
        (m) => m.AnalyticsPage,
      ),
  },
  {
    path: 'settings',
    title: 'Settings',
    loadComponent: () =>
      import('../pages/settings-page/settings-page').then(
        (m) => m.SettingsPage,
      ),
  },
];
