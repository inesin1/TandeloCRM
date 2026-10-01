import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApi } from '../../../auth/auth-api';
import { UsersApi } from './users-api';
import { UsersTab } from './users-tab';

function emptyResource() {
  return {
    value: () => [],
    error: () => undefined,
    isLoading: () => false,
    reload: vi.fn(),
  };
}

describe('UsersTab', () => {
  let fixture: ComponentFixture<UsersTab>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [UsersTab],
      providers: [
        {
          provide: UsersApi,
          useValue: {
            users: emptyResource(),
            roles: emptyResource(),
            groups: emptyResource(),
          },
        },
        {
          provide: AuthApi,
          useValue: { hasPermission: () => true },
        },
      ],
    });
    fixture = TestBed.createComponent(UsersTab);
    await fixture.whenStable();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shows validation after touch, not when the form first opens', async () => {
    const createButton = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((button: HTMLButtonElement) =>
      button.textContent?.includes('User'),
    ) as HTMLButtonElement;
    createButton.click();
    await fixture.whenStable();

    for (const selector of ['#userName', '#userEmail']) {
      const input = document.querySelector(selector);
      expect(input).not.toBeNull();
      expect(input?.classList.contains('p-invalid')).toBe(false);
    }

    const name = document.querySelector('#userName');
    name?.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(name?.classList.contains('p-invalid')).toBe(true);
  });
});
