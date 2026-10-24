import { Module } from '@nestjs/common';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { CopilotProvider } from './copilot-provider';
import { CopilotRunnerService } from './copilot-runner.service';
import { CopilotToolsService } from './copilot-tools.service';
import { LeadsModule } from '../leads/leads.module';
import { CompaniesModule } from '../companies/companies.module';
import { ContactsModule } from '../contacts/contacts.module';
import { TasksModule } from '../tasks/tasks.module';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { UsersModule } from '../users/users.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CopilotActionsService } from './copilot-actions.service';

@Module({
  imports: [
    LeadsModule,
    CompaniesModule,
    ContactsModule,
    TasksModule,
    PipelinesModule,
    CustomFieldsModule,
    UsersModule,
    AnalyticsModule,
  ],
  controllers: [CopilotController],
  providers: [CopilotService, CopilotProvider, CopilotRunnerService, CopilotToolsService, CopilotActionsService],
})
export class CopilotModule {}
