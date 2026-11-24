import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PIcon } from '@primeicons/angular/p-icon';
import { AuthApi } from '../../auth/auth-api';

interface SettingsItem {
  label: string;
  icon: string;
  routerLink: string;
  requiredPermission: string;
}

@Component({
  templateUrl: './settings-page.html',
  imports: [RouterModule, PIcon],
})
export class SettingsPage {
  private readonly authApi = inject(AuthApi);

  protected readonly items: SettingsItem[] = [
    {
      label: 'Workspace',
      icon: 'cog',
      routerLink: 'workspace',
      requiredPermission: 'pipelines:write',
    },
    {
      label: 'Pipelines',
      icon: 'sitemap',
      routerLink: 'pipelines',
      requiredPermission: 'pipelines:write',
    },
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
    {
      label: 'Integrations',
      icon: 'th-large',
      routerLink: 'integrations',
      requiredPermission: 'users:write',
    },
  ];

  protected canAccess(item: SettingsItem): boolean {
    return this.authApi.hasPermission(item.requiredPermission);
  }
}
