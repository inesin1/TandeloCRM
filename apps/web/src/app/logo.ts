import { Component } from '@angular/core';

@Component({
  selector: 'app-logo',
  host: { class: 'block size-6 shrink-0' },
  template: `
    <svg viewBox="0 0 32 32" class="size-full shrink-0" aria-hidden="true">
      <rect x="3" y="3" width="20" height="20" rx="7" fill="#0f5c4e" />
      <rect x="11" y="11" width="18" height="18" rx="7" fill="#86c440" />
    </svg>
  `,
})
export class Logo {}
