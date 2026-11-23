import { IsInt, IsString, ValidateIf } from 'class-validator';

export class CreateStatusDto {
  @IsString()
  name!: string;

  @IsString()
  color!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  sortOrder?: number;
}
