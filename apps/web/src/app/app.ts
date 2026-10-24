import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SidebarModule } from 'primeng/sidebar';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';
import { PIcon } from '@primeicons/angular/p-icon';
import { Logo } from '../shared/logo';
import { AuthApi } from '../features/auth/auth-api';
import { CopilotChat } from '../features/copilot/copilot-chat/copilot-chat';
import { CopilotState } from '../features/copilot/copilot-state';

interface NavItem {
  icon: string;
  label: string;
  routerLink: string;
  badge?: string;
}

@Component({
  imports: [RouterModule, SidebarModule, DrawerModule, ButtonModule, Tooltip, PIcon, Logo, CopilotChat],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly authApi = inject(AuthApi);
  protected readonly copilot = inject(CopilotState);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isCopilotRoute = signal(this.router.url.startsWith('/copilot'));

  protected title = 'Tandelo';

  navItems: NavItem[] = [
    { label: 'Desktop', icon: 'home', routerLink: '/desktop' },
    { label: 'Leads', icon: 'user-plus', routerLink: '/leads' },
    { label: 'Contacts', icon: 'users', routerLink: '/contacts' },
    { label: 'Companies', icon: 'building', routerLink: '/companies' },
    { label: 'Tasks', icon: 'check-square', routerLink: '/tasks' },
    { label: 'Analytics', icon: 'chart-bar', routerLink: '/analytics' },
    { label: 'Copilot', icon: 'sparkles', routerLink: '/copilot' },
    { label: 'Settings', icon: 'cog', routerLink: '/settings' },
  ];

  constructor() {
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      const onCopilotPage = this.router.url.startsWith('/copilot');
      this.isCopilotRoute.set(onCopilotPage);
      if (onCopilotPage) this.copilot.closePanel();
    });
  }

  protected panelVisibilityChanged(visible: boolean) {
    if (!visible) {
      const returnFocus = this.copilot.takePanelReturnFocus();
      this.copilot.closePanel();
      requestAnimationFrame(() => {
        if (returnFocus?.isConnected) returnFocus.focus();
      });
    }
  }

  protected openCopilot(event: MouseEvent) {
    this.copilot.openPanel(null, event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
  }

  protected logout() {
    this.authApi.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
