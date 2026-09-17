import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateStatusDto {
  @IsString()
  name!: string;

  @IsString()
  color!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
