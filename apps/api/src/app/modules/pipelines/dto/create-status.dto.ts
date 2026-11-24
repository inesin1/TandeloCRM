import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { stageOutcomes } from '../pipeline.entity';

export class CreateStatusDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(100)
  name!: string;

  @IsString()
  color!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(stageOutcomes)
  outcome?: (typeof stageOutcomes)[number];

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  sortOrder?: number;
}
