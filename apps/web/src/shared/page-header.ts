import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  template: `
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold tracking-tight text-surface-800">
        {{ title() }}
      </h1>
      @if (count() !== undefined) {
        <span class="text-lg text-surface-400">{{ count() }}</span>
      }
      <ng-content />
    </div>

    <div class="flex items-center gap-2">
      <ng-content select="[actions]" />
    </div>
  `,
  host: {
    class:
      'px-4 py-3 flex shrink-0 items-center justify-between gap-4 rounded-xl border border-[var(--p-content-border-color)] bg-[var(--p-content-background)] shadow-sm',
  },
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly count = input<number>();
}
