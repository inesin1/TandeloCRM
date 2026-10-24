import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { copilotApiFormats } from '../copilot-config.schema';

export class UpdateCopilotSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(copilotApiFormats)
  apiFormat!: (typeof copilotApiFormats)[number];

  @IsString()
  @MaxLength(2048)
  baseUrl!: string;

  @IsString()
  @MaxLength(200)
  model!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiKey?: string | null;
}
