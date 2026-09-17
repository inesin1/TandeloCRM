import { Module } from '@nestjs/common';
import { PipelinesService } from './pipelines.service';
import { PipelinesController } from './pipelines.controller';
import { StatusesService } from './statuses.service';
import { StatusesController } from './statuses.controller';

@Module({
  controllers: [PipelinesController, StatusesController],
  providers: [PipelinesService, StatusesService],
  exports: [PipelinesService, StatusesService],
})
export class PipelinesModule {}
