import { Component, computed, inject, signal } from '@angular/core';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { PIcon } from '@primeicons/angular/p-icon';
import { Plus } from '@primeicons/angular/plus';
import { User as UserIcon } from '@primeicons/angular/user';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Drawer } from 'primeng/drawer';
import { SelectModule } from 'primeng/select';
import { LeadsApi, User } from '../../../leads/leads-api';

interface UserEditForm {
  name: string;
  email: string;
  role: 'Admin' | 'Manager';
  group: string;
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
    ButtonModule,
    AvatarModule,
    TableModule,
    TagModule,
    Drawer,
    SelectModule,
  ],
})
export class UsersTab {
  private readonly leadsApi = inject(LeadsApi);
  protected readonly usersVersion = signal(0);

  protected readonly search = signal('');
  protected readonly selectedUser = signal<User | null>(null);
  protected readonly drawerVisible = signal(false);

  protected readonly editForm = signal<UserEditForm>({
    name: '',
    email: '',
    role: 'Manager',
    group: '',
  });

  protected readonly roleOptions = [
    { label: 'Admin', value: 'Admin' as const },
    { label: 'Manager', value: 'Manager' as const },
  ];

  protected readonly groupOptions = computed(() => {
    this.usersVersion();
    const groups = new Set(this.leadsApi.users.map((u) => u.group));
    return Array.from(groups).sort();
  });

  protected readonly hasChanges = computed(() => {
    const user = this.selectedUser();
    if (!user) return false;
    const form = this.editForm();
    return (
      form.name.trim() !== user.name ||
      form.email.trim() !== user.email ||
      form.role !== user.role ||
      form.group.trim() !== user.group
    );
  });

  protected readonly isValid = computed(() => {
    const form = this.editForm();
    return (
      form.name.trim().length > 0 &&
      form.email.trim().length > 0 &&
      form.group.trim().length > 0
    );
  });

  protected readonly rows = computed(() => {
    this.usersVersion();
    const search = this.search().trim().toLowerCase();

    return this.leadsApi.users.filter(
      (user) =>
        !search ||
        user.name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search),
    );
  });

  protected openUserDrawer(user: User) {
    this.selectedUser.set(user);
    this.editForm.set({
      name: user.name,
      email: user.email,
      role: user.role,
      group: user.group,
    });
    this.drawerVisible.set(true);
  }

  protected updateFormField<K extends keyof UserEditForm>(
    field: K,
    value: UserEditForm[K],
  ) {
    this.editForm.update((form) => ({
      ...form,
      [field]: value,
    }));
  }

  protected isRowSelected(user: User): boolean {
    return this.drawerVisible() && this.selectedUser()?.id === user.id;
  }

  protected closeDrawer() {
    this.drawerVisible.set(false);
  }

  protected saveUser() {
    const user = this.selectedUser();
    if (!user || !this.hasChanges() || !this.isValid()) return;

    const form = this.editForm();
    const target = this.leadsApi.users.find((u) => u.id === user.id);
    if (target) {
      target.name = form.name.trim();
      target.email = form.email.trim();
      target.role = form.role;
      target.group = form.group.trim();
      this.selectedUser.set({ ...target });
    }

    this.usersVersion.update((v) => v + 1);
    this.drawerVisible.set(false);
  }
}
