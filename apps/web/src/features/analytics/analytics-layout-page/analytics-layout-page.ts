import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PIcon } from '@primeicons/angular/p-icon';

@Component({
  templateUrl: './analytics-layout-page.html',
  imports: [PIcon, RouterLink, RouterLinkActive, RouterOutlet],
})
export class AnalyticsLayoutPage {
  protected readonly reports = [
    { label: 'Pipeline', icon: 'chart-bar', routerLink: 'pipeline' },
    { label: 'New leads by owner', icon: 'users', routerLink: 'team' },
    { label: 'Tasks', icon: 'check-square', routerLink: 'tasks' },
  ];
}
