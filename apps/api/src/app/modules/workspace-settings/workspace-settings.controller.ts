import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { RequirePermissions } from '../access-control/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { workspaceSettings } from './workspace-settings.entity';

class UpdateWorkspaceSettingsDto {
  @IsIn(Intl.supportedValuesOf('currency'))
  currency!: string;
}

@ApiTags('workspace settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspace-settings')
export class WorkspaceSettingsController {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  @Get()
  async getSettings() {
    const [settings] = await this.db
      .select({ currency: workspaceSettings.currency })
      .from(workspaceSettings);
    return settings ?? { currency: 'USD' };
  }

  @Put()
  @RequirePermissions('pipelines:write')
  async updateSettings(@Body() { currency }: UpdateWorkspaceSettingsDto) {
    const [settings] = await this.db
      .insert(workspaceSettings)
      .values({ id: 1, currency })
      .onConflictDoUpdate({ target: workspaceSettings.id, set: { currency } })
      .returning({ currency: workspaceSettings.currency });
    return settings;
  }
}
