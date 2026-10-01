import { Component, computed, inject, signal } from '@angular/core';
import {
  disabled,
  form,
  FormField,
  required,
  submit,
} from '@angular/forms/signals';
import { ButtonModule } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { AuthApi } from '../../../auth/auth-api';
import { Group, UsersApi } from '../users-tab/users-api';

@Component({
  templateUrl: './groups-tab.html',
  host: { class: 'block' },
  imports: [
    ButtonModule,
    Drawer,
    FormField,
    InputTextModule,
    MessageModule,
    TableModule,
  ],
})
export class GroupsTab {
  private readonly usersApi = inject(UsersApi);
  private readonly authApi = inject(AuthApi);

  protected readonly groups = this.usersApi.groups;
  protected readonly canManageGroups = computed(() =>
    this.authApi.hasPermission('groups:write'),
  );
  protected readonly selectedGroup = signal<Group | null>(null);
  protected readonly drawerVisible = signal(false);
  protected readonly saveError = signal('');
  private readonly model = signal({ name: '' });

  protected readonly groupForm = form(this.model, (path) => {
    disabled(path.name, { when: () => !this.canManageGroups() });
    required(path.name, {
      when: ({ state }) => state.touched(),
      message: 'Group name is required',
    });
  });

  protected openCreateGroup() {
    this.selectedGroup.set(null);
    this.saveError.set('');
    this.groupForm().reset({ name: '' });
    this.drawerVisible.set(true);
  }

  protected openGroup(group: Group) {
    this.selectedGroup.set(group);
    this.saveError.set('');
    this.groupForm().reset({ name: group.name });
    this.drawerVisible.set(true);
  }

  protected closeDrawer() {
    this.drawerVisible.set(false);
  }

  protected onSubmit(event: Event) {
    event.preventDefault();
    if (!this.canManageGroups()) {
      return;
    }

    this.groupForm.name().markAsTouched();
    const selectedGroup = this.selectedGroup();
    this.saveError.set('');
    submit(this.groupForm, async () => {
      const name = this.model().name.trim();
      if (!name) {
        this.saveError.set('Group name is required');
        return;
      }

      try {
        if (selectedGroup) {
          await this.usersApi.updateGroup(selectedGroup.id, name);
        } else {
          await this.usersApi.createGroup(name);
        }
        this.groups.reload();
        this.drawerVisible.set(false);
      } catch {
        this.saveError.set('Failed to save group, try again later');
      }
    });
  }

  protected async removeGroup(event: Event, group: Group) {
    event.stopPropagation();
    if (
      !this.canManageGroups() ||
      !window.confirm(`Delete the group “${group.name}”?`)
    ) {
      return;
    }

    this.saveError.set('');
    try {
      await this.usersApi.removeGroup(group.id);
      this.groups.reload();
      if (this.selectedGroup()?.id === group.id) {
        this.drawerVisible.set(false);
      }
    } catch {
      this.saveError.set('Failed to delete group, try again later');
    }
  }
}
