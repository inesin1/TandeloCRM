import { Route } from '@angular/router';
import { authGuard } from '../features/auth/auth-guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    title: 'Login',
    loadComponent: () =>
      import('../features/auth/login-page/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'desktop' },
      {
        path: 'desktop',
        title: 'Desktop',
        loadComponent: () =>
          import('../features/desktop/desktop-page/desktop-page').then(
            (m) => m.DesktopPage,
          ),
      },
      {
        path: 'leads',
        title: 'Leads',
        loadComponent: () =>
          import('../features/leads/leads-page/leads-page').then(
            (m) => m.LeadsPage,
          ),
      },
      {
        path: 'leads/:id',
        title: 'Lead',
        canDeactivate: [
          (
            component: import('../features/leads/lead-detail-page/lead-detail-page').LeadDetailPage,
          ) => component.canLeave(),
        ],
        loadComponent: () =>
          import('../features/leads/lead-detail-page/lead-detail-page').then(
            (m) => m.LeadDetailPage,
          ),
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
        path: 'contacts/:id',
        title: 'Contact',
        data: { recordKind: 'contact' },
        canDeactivate: [
          (
            component: import('../features/records/record-detail-page/record-detail-page').RecordDetailPage,
          ) => component.canLeave(),
        ],
        loadComponent: () =>
          import('../features/records/record-detail-page/record-detail-page').then(
            (m) => m.RecordDetailPage,
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
        path: 'companies/:id',
        title: 'Company',
        data: { recordKind: 'company' },
        canDeactivate: [
          (
            component: import('../features/records/record-detail-page/record-detail-page').RecordDetailPage,
          ) => component.canLeave(),
        ],
        loadComponent: () =>
          import('../features/records/record-detail-page/record-detail-page').then(
            (m) => m.RecordDetailPage,
          ),
      },
      {
        path: 'tasks',
        title: 'Tasks',
        loadComponent: () =>
          import('../features/tasks/tasks-page/tasks-page').then(
            (m) => m.TasksPage,
          ),
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
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'profile' },
          {
            path: 'profile',
            title: 'Profile',
            loadComponent: () =>
              import('../features/settings/tabs/profile-tab/profile-tab').then(
                (m) => m.ProfileTab,
              ),
          },
          {
            path: 'notifications',
            title: 'Notifications',
            loadComponent: () =>
              import('../features/settings/tabs/notifications-tab/notifications-tab').then(
                (m) => m.NotificationsTab,
              ),
          },
          {
            path: 'workspace',
            title: 'Workspace',
            loadComponent: () =>
              import('../features/settings/tabs/workspace-tab/workspace-tab').then(
                (m) => m.WorkspaceTab,
              ),
          },
          {
            path: 'users',
            title: 'Users',
            loadComponent: () =>
              import('../features/settings/tabs/users-tab/users-tab').then(
                (m) => m.UsersTab,
              ),
          },
          {
            path: 'groups',
            title: 'Groups',
            loadComponent: () =>
              import('../features/settings/tabs/groups-tab/groups-tab').then(
                (m) => m.GroupsTab,
              ),
          },
          {
            path: 'integrations',
            title: 'Integrations',
            loadComponent: () =>
              import('../features/settings/tabs/integrations-tab/integrations-tab').then(
                (m) => m.IntegrationsTab,
              ),
          },
        ],
      },
    ],
  },
];
