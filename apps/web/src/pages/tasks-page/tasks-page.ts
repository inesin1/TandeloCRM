import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Plus } from '@primeicons/angular/plus';

@Component({
  templateUrl: './tasks-page.html',
  imports: [ButtonModule, Plus],
})
export class TasksPage {}
