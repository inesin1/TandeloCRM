import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePipelineDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
