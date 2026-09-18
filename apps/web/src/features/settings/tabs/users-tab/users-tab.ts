import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { PIcon } from '@primeicons/angular/p-icon';
import { Plus } from '@primeicons/angular/plus';
import { User as UserIcon } from '@primeicons/angular/user';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Drawer } from 'primeng/drawer';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { User, UserChanges, UsersApi } from './users-api';

@Component({
  templateUrl: './users-tab.html',
  host: {
    class: 'block',
  },
  imports: [
    IconField,
    InputIcon,
    InputTextModule,
    PIcon,
    Plus,
    UserIcon,
    FormsModule,
    FormField,
    ButtonModule,
    AvatarModule,
    TableModule,
    TagModule,
    Drawer,
    MessageModule,
    SelectModule,
  ],
})
export class UsersTab {
  private readonly usersApi = inject(UsersApi);

  protected readonly users = this.usersApi.users;
  protected readonly roles = this.usersApi.roles;
  protected readonly groups = this.usersApi.groups;

  protected readonly loadError = computed(
    () => this.users.error() ?? this.roles.error() ?? this.groups.error(),
  );

  protected readonly search = signal('');
  protected readonly selectedUser = signal<User | null>(null);
  protected readonly drawerVisible = signal(false);
  protected readonly saveError = signal('');

  private readonly model = signal<UserChanges>({
    name: '',
    email: '',
    roleIds: [],
    groupIds: [],
  });

  protected readonly userForm = form(this.model, (path) => {
    required(path.name, { message: 'Name is required' });
    required(path.email, { message: 'Email is required' });
    email(path.email, { message: 'Please enter a valid email' });
  });

  protected readonly rows = computed(() => {
    const search = this.search().trim().toLowerCase();

    return this.users
      .value()
      .filter(
        (user) =>
          !search ||
          user.name.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search),
      )
      .map((user) => ({
        ...user,
        groupNames: user.groups.map((group) => group.name).join(', '),
      }));
  });

  protected openUserDrawer(user: User) {
    this.selectedUser.set(user);
    this.saveError.set('');
    this.userForm().reset({
      name: user.name,
      email: user.email,
      roleIds: user.roles.map((role) => role.id),
      groupIds: user.groups.map((group) => group.id),
    });
    this.drawerVisible.set(true);
  }

  protected isRowSelected(user: User): boolean {
    return this.drawerVisible() && this.selectedUser()?.id === user.id;
  }

  protected closeDrawer() {
    this.drawerVisible.set(false);
  }

  protected onSubmit(event: Event) {
    event.preventDefault();
    const user = this.selectedUser();
    if (!user) {
      return;
    }
    this.saveError.set('');

    submit(this.userForm, async () => {
      try {
        await this.usersApi.update(user.id, this.model());
        this.users.reload();
        this.drawerVisible.set(false);
      } catch {
        this.saveError.set('Failed to save user, try again later');
      }
    });
  }
}
