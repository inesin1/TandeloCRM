import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SidebarModule } from 'primeng/sidebar';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { PIcon } from '@primeicons/angular/p-icon';
import { Sidebar } from '@primeicons/angular/sidebar';

interface NavItem {
  icon: string;
  label: string;
  routerLink: string;
  isActive?: boolean;
  badge?: string;
  subItems?: { label: string; isActive?: boolean }[];
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

@Component({
  imports: [
    RouterModule,
    SidebarModule,
    ButtonModule,
    AvatarModule,
    PIcon,
    Sidebar,
  ],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected title = 'OpenCRM';

  navGroups: NavGroup[] = [
    {
      label: 'Workspace',
      items: [
        { label: 'Desktop', icon: 'home', routerLink: '/desktop' },
        { label: 'Leads', icon: 'user-plus', routerLink: '/leads' },
        { label: 'Contacts', icon: 'users', routerLink: '/contacts' },
        { label: 'Tasks', icon: 'check-square', routerLink: '/tasks' },
      ],
    },
    {
      label: 'System',
      items: [
        { label: 'Analytics', icon: 'chart-bar', routerLink: '/analytics' },
        { label: 'Settings', icon: 'cog', routerLink: '/settings' },
      ],
    },
  ];

  hasActiveSub(item: NavItem): boolean {
    return !!item.subItems?.some((s) => s.isActive);
  }
}
