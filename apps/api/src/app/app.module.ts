import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';
import { UsersModule } from './modules/users/users.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { LeadsModule } from './modules/leads/leads.module';
import { PipelinesModule } from './modules/pipelines/pipelines.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    AccessControlModule,
    CustomFieldsModule,
    PipelinesModule,
    CompaniesModule,
    ContactsModule,
    LeadsModule,
    TasksModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
