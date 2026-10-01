import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApi } from '../../../auth/auth-api';
import { UsersApi } from '../users-tab/users-api';
import { GroupsTab } from './groups-tab';

describe('GroupsTab', () => {
  let fixture: ComponentFixture<GroupsTab>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GroupsTab],
      providers: [
        {
          provide: UsersApi,
          useValue: {
            groups: {
              value: () => [],
              error: () => undefined,
              isLoading: () => false,
              reload: vi.fn(),
            },
          },
        },
        {
          provide: AuthApi,
          useValue: { hasPermission: () => true },
        },
      ],
    });
    fixture = TestBed.createComponent(GroupsTab);
    await fixture.whenStable();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shows validation after touch, not when the form first opens', async () => {
    const createButton = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((button: HTMLButtonElement) =>
      button.textContent?.includes('Create group'),
    ) as HTMLButtonElement;
    createButton.click();
    await fixture.whenStable();

    const input = document.querySelector('#groupName');
    expect(input).not.toBeNull();
    expect(input?.classList.contains('p-invalid')).toBe(false);

    input?.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(input?.classList.contains('p-invalid')).toBe(true);
  });
});
