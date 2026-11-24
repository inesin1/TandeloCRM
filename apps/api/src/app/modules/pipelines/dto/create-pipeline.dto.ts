import {
  IsInt,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreatePipelineDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(100)
  name!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  sortOrder?: number;
}
