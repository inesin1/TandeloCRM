import { Component, input } from '@angular/core';
import { PIcon } from '@primeicons/angular/p-icon';

@Component({
  selector: 'app-user-chip',
  template: `
    <span
      class="flex shrink-0 items-center justify-center rounded-full bg-surface-100"
      [class]="small() ? 'size-5' : 'size-6'"
    >
      <svg [pIcon]="'user'" [class]="small() ? 'size-3' : 'size-3.5'"></svg>
    </span>
    <span class="truncate">{{ name() }}</span>
  `,
  host: {
    class: 'flex min-w-0 items-center gap-2',
  },
  imports: [PIcon],
})
export class UserChip {
  readonly name = input.required<string>();
  readonly small = input(false);
}
