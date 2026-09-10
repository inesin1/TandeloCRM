import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';

const preset = definePreset(Aura, {
  semantic: {
    primary: {
      color: '{emerald.800}',
      contrastColor: '#ffffff',
      hoverColor: '{emerald.900}',
      activeColor: '{emerald.900}',
    },
  },
  components: {
    datatable: {
      headerCell: {
        background: '{surface.50}',
      },
    },
    sidebar: {
      aside: { padding: '1rem' },
      panel: {
        floatingBorderRadius: '0.75rem',
        floatingShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
      },
      menuButton: {
        iconOnlyWidth: '2.75rem',
        height: '2.25rem',
        fontSize: '0.875rem',
        fontWeight: '500',
        icon: { size: '1.5rem' },
      },
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    providePrimeNG({
      license:
        'eyJpZCI6ImJjOGYxN2VkLTQ2YzUtNDUxNi1hMTc5LTFkN2FlOGRhZWQ4MSIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3ODg4NTQ4MjQsImV4cCI6MTgyMDM5MDgyNH0.lwDG5CqnEaGtBOzFiagv4DI8UbNAP7ni_QMi5Ci_FUlN_IAfx8AlqPV8gG12CNk6gKK9PhOhATjxBMfFkNSwBw',
      theme: {
        preset,
        options: { darkModeSelector: 'none' },
      },
    }),
  ],
};
