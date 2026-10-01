import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from '../features/auth/auth-interceptor';

const preset = definePreset(Aura, {
  semantic: {
    primary: {
      color: '{emerald.800}',
      contrastColor: '#ffffff',
      hoverColor: '{emerald.900}',
      activeColor: '{emerald.900}',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f7f9f7',
          100: '#eef3ef',
          200: '#e0e8e2',
          300: '#ced9d1',
          400: '#9aa99d',
          500: '#718075',
          600: '#536457',
          700: '#3c4c40',
          800: '#26372b',
          900: '#19291f',
          950: '#101a14',
        },
      },
    },
  },
  components: {
    datatable: {
      headerCell: {
        background: '{surface.50}',
      },
    },
    sidebar: {
      aside: { padding: '0.5rem' },
      panel: {
        floatingBorderRadius: '0.75rem',
        floatingShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
      },
      menuButton: {
        iconOnlyWidth: '2.75rem',
        height: '2.25rem',
        fontSize: '0.875rem',
        fontWeight: '500',
        icon: {
          color: '#edf8f0',
          focusColor: '#ffffff',
          size: '1.5rem',
        },
      },
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([authInterceptor])),
    providePrimeNG({
      license:
        'eyJpZCI6ImJjOGYxN2VkLTQ2YzUtNDUxNi1hMTc5LTFkN2FlOGRhZWQ4MSIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3ODg4NTQ4MjQsImV4cCI6MTgyMDM5MDgyNH0.lwDG5CqnEaGtBOzFiagv4DI8UbNAP7ni_QMi5Ci_FUlN_IAfx8AlqPV8gG12CNk6gKK9PhOhATjxBMfFkNSwBw',
      theme: {
        preset,
        options: {
          darkModeSelector: 'none',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng, components, utilities',
          },
        },
      },
    }),
  ],
};
