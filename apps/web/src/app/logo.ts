import { Component } from '@angular/core';

@Component({
  selector: 'app-logo',
  host: { class: 'block size-6 shrink-0' },
  template: `
    <svg viewBox="0 0 32 32" class="size-full shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--p-primary-color)" />
      <rect
        x="9.75"
        y="9.75"
        width="12.5"
        height="12.5"
        rx="4.25"
        fill="none"
        stroke="var(--p-primary-contrast-color)"
        stroke-width="3.5"
      />
    </svg>
  `,
})
export class Logo {}
