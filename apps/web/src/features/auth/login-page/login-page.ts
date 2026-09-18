import { Component, inject, signal } from '@angular/core';
import { InputTextModule } from 'primeng/inputtext';
import { IftaLabelModule } from 'primeng/iftalabel';
import { InputIconModule } from 'primeng/inputicon';
import { InputPasswordModule } from 'primeng/inputpassword';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { Eye } from '@primeicons/angular/eye';
import { EyeSlash } from '@primeicons/angular/eye-slash';
import { IconFieldModule } from 'primeng/iconfield';
import {
  form,
  FormField,
  required,
  email,
  minLength,
  submit,
} from '@angular/forms/signals';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthApi } from '../auth-api';
import { Logo } from '../../../shared/logo';

interface LoginCredentials {
  email: string;
  password: string;
}

@Component({
  templateUrl: './login-page.html',
  imports: [
    IftaLabelModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    InputPasswordModule,
    ButtonModule,
    MessageModule,
    Eye,
    EyeSlash,
    FormField,
    Logo,
  ],
  host: { class: 'grid min-h-dvh place-items-center bg-surface-50 p-4' },
})
export class LoginPage {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApi);

  protected readonly formState = signal<LoginCredentials>({
    email: '',
    password: '',
  });
  protected passwordMask = true;
  protected readonly serverError = signal('');
  protected readonly loginForm = form(this.formState, (path) => {
    required(path.email, {
      when: ({ state }) => state.touched(),
      message: 'Email is required',
    });
    email(path.email, {
      when: ({ state }) => state.touched(),
      message: 'Please enter a valid email',
    });
    required(path.password, {
      when: ({ state }) => state.touched(),
      message: 'Password is required',
    });
    minLength(path.password, 8, {
      when: ({ state }) => state.touched(),
      message: 'Password must be at least 8 characters long',
    });
  });

  protected onSubmit = (event: Event) => {
    event.preventDefault();
    this.serverError.set('');

    submit(this.loginForm, async () => {
      const { email, password } = this.formState();

      try {
        await this.authApi.login(email, password);
        this.router.navigateByUrl('/leads');
      } catch (error) {
        this.serverError.set(
          error instanceof HttpErrorResponse && error.status === 401
            ? 'Invalid email or password'
            : 'Something went wrong, try again later',
        );
      }
    });
  };
}
