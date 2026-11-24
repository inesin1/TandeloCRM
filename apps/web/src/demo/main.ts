import { HashLocationStrategy, LocationStrategy } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from '../app/app.config';
import { App } from '../app/app';
import { AUTH_STORAGE_KEY } from '../features/auth/auth-api';
import { demoApi, resetDemo } from './demo-api';
import { demoAccessKey } from './demo-data';
import { DEMO_RESET } from './demo-reset';

localStorage.setItem(demoAccessKey, 'static-demo');
bootstrapApplication(App, {
  providers: [
    ...appConfig.providers,
    { provide: LocationStrategy, useClass: HashLocationStrategy },
    { provide: AUTH_STORAGE_KEY, useValue: demoAccessKey },
    { provide: DEMO_RESET, useValue: resetDemo },
    provideHttpClient(withInterceptors([demoApi])),
  ],
}).catch((error) => console.error(error));
