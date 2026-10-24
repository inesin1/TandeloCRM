import { Type } from 'class-transformer';
import {
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CopilotContext } from '../copilot.types';

const CONTEXT_KINDS: CopilotContext['kind'][] = [
  'lead',
  'company',
  'contact',
  'task',
];

class CopilotContextDto implements CopilotContext {
  @IsIn(CONTEXT_KINDS)
  kind!: CopilotContext['kind'];

  @IsInt()
  @Min(1)
  id!: number;
}

export class SendMessageDto {
  @IsUUID('4')
  clientRequestId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CopilotContextDto)
  context?: CopilotContextDto;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timezone!: string;
}
