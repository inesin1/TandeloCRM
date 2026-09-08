import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    providePrimeNG({
      license:
        'eyJpZCI6ImJjOGYxN2VkLTQ2YzUtNDUxNi1hMTc5LTFkN2FlOGRhZWQ4MSIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3ODg4NTQ4MjQsImV4cCI6MTgyMDM5MDgyNH0.lwDG5CqnEaGtBOzFiagv4DI8UbNAP7ni_QMi5Ci_FUlN_IAfx8AlqPV8gG12CNk6gKK9PhOhATjxBMfFkNSwBw',
      theme: {
        preset: Aura,
      },
    }),
  ],
};
