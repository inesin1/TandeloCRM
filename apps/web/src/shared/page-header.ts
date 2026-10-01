import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  template: `
    <div class="flex items-center gap-3">
      <h1
        class="text-[1.75rem] font-semibold leading-tight tracking-tight text-surface-900"
      >
        {{ title() }}
      </h1>
      @if (count() !== undefined) {
        <span class="text-sm font-medium text-surface-500">{{ count() }}</span>
      }
      <ng-content />
    </div>

    <div class="flex items-center gap-2">
      <ng-content select="[actions]" />
    </div>
  `,
  host: {
    class:
      'mb-1 flex shrink-0 items-center justify-between gap-4 border-b border-[var(--p-content-border-color)] py-4',
  },
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly count = input<number>();
}
