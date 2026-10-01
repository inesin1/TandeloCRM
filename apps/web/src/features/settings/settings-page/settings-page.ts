import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PIcon } from '@primeicons/angular/p-icon';
import { AuthApi } from '../../auth/auth-api';

interface SettingsGroup {
  label: string;
  items: {
    label: string;
    icon: string;
    routerLink: string;
    requiredPermission?: string;
  }[];
}

@Component({
  templateUrl: './settings-page.html',
  imports: [RouterModule, PIcon],
})
export class SettingsPage {
  private readonly authApi = inject(AuthApi);

  protected readonly groups: SettingsGroup[] = [
    {
      label: 'Personal',
      items: [
        { label: 'Profile', icon: 'user', routerLink: 'profile' },
        { label: 'Notifications', icon: 'bell', routerLink: 'notifications' },
      ],
    },
    {
      label: 'Workspace',
      items: [
        { label: 'General', icon: 'sliders-h', routerLink: 'workspace' },
        {
          label: 'Users',
          icon: 'users',
          routerLink: 'users',
          requiredPermission: 'users:read',
        },
        {
          label: 'Groups',
          icon: 'users',
          routerLink: 'groups',
          requiredPermission: 'groups:read',
        },
      ],
    },
    {
      label: 'System',
      items: [
        { label: 'Integrations', icon: 'th-large', routerLink: 'integrations' },
      ],
    },
  ];

  protected canAccess(item: SettingsGroup['items'][number]): boolean {
    return (
      !item.requiredPermission ||
      this.authApi.hasPermission(item.requiredPermission)
    );
  }
}
