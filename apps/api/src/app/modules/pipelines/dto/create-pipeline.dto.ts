import { IsInt, IsString, ValidateIf } from 'class-validator';

export class CreatePipelineDto {
  @IsString()
  name!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  sortOrder?: number;
}
