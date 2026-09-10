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
      import('../features/desktop/desktop-page/desktop-page').then((m) => m.DesktopPage),
  },
  {
    path: 'leads',
    title: 'Leads',
    loadComponent: () =>
      import('../features/leads/leads-page/leads-page').then((m) => m.LeadsPage),
  },
  {
    path: 'contacts',
    title: 'Contacts',
    loadComponent: () =>
      import('../features/contacts/contacts-page/contacts-page').then(
        (m) => m.ContactsPage,
      ),
  },
  {
    path: 'companies',
    title: 'Companies',
    loadComponent: () =>
      import('../features/companies/companies-page/companies-page').then(
        (m) => m.CompaniesPage,
      ),
  },
  {
    path: 'tasks',
    title: 'Tasks',
    loadComponent: () =>
      import('../features/tasks/tasks-page/tasks-page').then((m) => m.TasksPage),
  },
  {
    path: 'analytics',
    title: 'Analytics',
    loadComponent: () =>
      import('../features/analytics/analytics-page/analytics-page').then(
        (m) => m.AnalyticsPage,
      ),
  },
  {
    path: 'settings',
    title: 'Settings',
    loadComponent: () =>
      import('../features/settings/settings-page/settings-page').then(
        (m) => m.SettingsPage,
      ),
  },
];
