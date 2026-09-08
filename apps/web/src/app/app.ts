import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SidebarModule } from 'primeng/sidebar';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { PIcon } from '@primeicons/angular/p-icon';
import { Sidebar } from '@primeicons/angular/sidebar';
import { Logo } from './logo';

interface NavItem {
  icon: string;
  label: string;
  routerLink: string;
  badge?: string;
}

@Component({
  imports: [
    RouterModule,
    SidebarModule,
    ButtonModule,
    AvatarModule,
    PIcon,
    Sidebar,
    Logo,
  ],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected title = 'OpenCRM';

  navItems: NavItem[] = [
    { label: 'Desktop', icon: 'home', routerLink: '/desktop' },
    { label: 'Leads', icon: 'user-plus', routerLink: '/leads' },
    { label: 'Contacts', icon: 'users', routerLink: '/contacts' },
    { label: 'Companies', icon: 'building', routerLink: '/companies' },
    { label: 'Tasks', icon: 'check-square', routerLink: '/tasks' },
    { label: 'Analytics', icon: 'chart-bar', routerLink: '/analytics' },
    { label: 'Settings', icon: 'cog', routerLink: '/settings' },
  ];
}
