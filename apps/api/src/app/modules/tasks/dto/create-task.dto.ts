import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { TASK_TYPES, TaskType } from '../task.entity';

export class CreateTaskDto {
  @IsInt()
  leadId!: number;

  @IsIn(TASK_TYPES)
  type!: TaskType;

  @IsString()
  text!: string;

  @Type(() => Date)
  @IsDate()
  dueAt!: Date;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  isCompleted?: boolean;

  @IsOptional()
  @IsInt()
  assigneeId?: number | null;
}
