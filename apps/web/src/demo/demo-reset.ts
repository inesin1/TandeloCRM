import { InjectionToken } from '@angular/core';

export const DEMO_RESET = new InjectionToken<() => void>('Reset demo data');
