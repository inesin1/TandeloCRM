import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  disabled,
  email,
  form,
  FormField,
  minLength,
  required,
  submit,
} from '@angular/forms/signals';
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
import { AuthApi } from '../../../auth/auth-api';
import { User, UserChanges, UsersApi } from './users-api';

interface UserFormValue {
  name: string;
  email: string;
  password: string;
  roleId: number | null;
  groupIds: number[];
}

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
  private readonly authApi = inject(AuthApi);

  protected readonly users = this.usersApi.users;
  protected readonly roles = this.usersApi.roles;
  protected readonly groups = this.usersApi.groups;
  protected readonly canManageUsers = computed(() =>
    this.authApi.hasPermission('users:write'),
  );

  protected readonly loadError = computed(
    () => this.users.error() ?? this.roles.error() ?? this.groups.error(),
  );

  protected readonly search = signal('');
  protected readonly selectedUser = signal<User | null>(null);
  protected readonly drawerVisible = signal(false);
  protected readonly saveError = signal('');
  protected readonly resetPasswordValue = signal('');
  protected readonly passwordMessage = signal('');

  private readonly model = signal<UserFormValue>({
    name: '',
    email: '',
    password: '',
    roleId: null,
    groupIds: [],
  });

  protected readonly userForm = form(this.model, (path) => {
    disabled(path.name, { when: () => !this.canManageUsers() });
    disabled(path.email, { when: () => !this.canManageUsers() });
    disabled(path.roleId, { when: () => !this.canManageUsers() });
    disabled(path.groupIds, { when: () => !this.canManageUsers() });
    required(path.name, {
      when: ({ state }) => state.touched(),
      message: 'Name is required',
    });
    required(path.email, {
      when: ({ state }) => state.touched(),
      message: 'Email is required',
    });
    email(path.email, {
      when: ({ state }) => state.touched(),
      message: 'Please enter a valid email',
    });
    required(path.roleId, {
      when: ({ state }) => state.touched(),
      message: 'Please select a role',
    });
    required(path.password, {
      when: ({ state }) => !this.selectedUser() && state.touched(),
      message: 'Initial password is required',
    });
    minLength(path.password, 8, {
      when: ({ state }) => !this.selectedUser() && state.touched(),
      message: 'Password must be at least 8 characters long',
    });
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

  protected openCreateUser() {
    this.selectedUser.set(null);
    this.saveError.set('');
    this.passwordMessage.set('');
    this.resetPasswordValue.set('');
    this.userForm().reset({
      name: '',
      email: '',
      password: '',
      roleId: null,
      groupIds: [],
    });
    this.drawerVisible.set(true);
  }

  protected openUserDrawer(user: User) {
    this.selectedUser.set(user);
    this.saveError.set('');
    this.passwordMessage.set('');
    this.resetPasswordValue.set('');
    this.userForm().reset({
      name: user.name,
      email: user.email,
      password: '',
      roleId: user.roles[0]?.id ?? null,
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
    if (!this.canManageUsers()) {
      return;
    }

    this.userForm.name().markAsTouched();
    this.userForm.email().markAsTouched();
    this.userForm.password().markAsTouched();
    this.userForm.roleId().markAsTouched();

    const user = this.selectedUser();
    this.saveError.set('');

    submit(this.userForm, async () => {
      const value = this.model();
      const changes: UserChanges = {
        name: value.name,
        email: value.email,
        roleIds: value.roleId === null ? [] : [value.roleId],
        groupIds: value.groupIds,
      };

      try {
        if (user) {
          await this.usersApi.update(user.id, changes);
        } else {
          await this.usersApi.create({ ...changes, password: value.password });
        }
        this.users.reload();
        this.drawerVisible.set(false);
      } catch {
        this.saveError.set('Failed to save user, try again later');
      }
    });
  }

  protected async toggleUserStatus() {
    const user = this.selectedUser();
    if (!user || !this.canManageUsers()) {
      return;
    }

    this.saveError.set('');
    try {
      const isActive = !user.isActive;
      await this.usersApi.update(user.id, { isActive });
      this.selectedUser.set({ ...user, isActive });
      this.users.reload();
    } catch {
      this.saveError.set('Failed to update user status, try again later');
    }
  }

  protected async resetPassword() {
    const user = this.selectedUser();
    const password = this.resetPasswordValue();
    if (!user || !this.canManageUsers()) {
      return;
    }
    if (password.length < 8) {
      this.passwordMessage.set('Password must be at least 8 characters long');
      return;
    }

    this.saveError.set('');
    this.passwordMessage.set('');
    try {
      await this.usersApi.update(user.id, { password });
      this.resetPasswordValue.set('');
      this.passwordMessage.set('Password reset');
    } catch {
      this.passwordMessage.set('Failed to reset password, try again later');
    }
  }
}
