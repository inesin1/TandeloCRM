import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../access-control/require-permissions.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('pipeline')
  @RequirePermissions('analytics:read')
  getPipeline() {
    return this.analyticsService.getPipeline();
  }

  @Get('team')
  @RequirePermissions('analytics:read')
  getTeam(@Query('days') days = '30') {
    const requestedDays = Number(days);
    const validDays = [7, 30, 90].includes(requestedDays)
      ? requestedDays
      : days === 'all'
        ? undefined
        : 30;

    return this.analyticsService.getTeam(validDays);
  }

  @Get('tasks')
  @RequirePermissions('analytics:read')
  getTasks() {
    return this.analyticsService.getTasks();
  }
}
