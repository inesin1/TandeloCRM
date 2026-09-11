import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PIcon } from '@primeicons/angular/p-icon';

interface SettingsGroup {
  label: string;
  items: { label: string; icon: string; routerLink: string }[];
}

@Component({
  templateUrl: './settings-page.html',
  imports: [RouterModule, PIcon],
})
export class SettingsPage {
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
        { label: 'Users', icon: 'users', routerLink: 'users' },
      ],
    },
    {
      label: 'System',
      items: [
        { label: 'Integrations', icon: 'th-large', routerLink: 'integrations' },
      ],
    },
  ];
}
