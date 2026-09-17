import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateLeadDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsInt()
  pipelineId!: number;

  @ApiProperty()
  @IsInt()
  statusId!: number;

  @ApiPropertyOptional({ default: 0 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  price?: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  source?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  companyId?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  ownerId?: number | null;

  @ApiPropertyOptional({ type: [Number] })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  contactIds?: number[];

  @ApiPropertyOptional({ type: Object, default: {} })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsObject()
  customFields?: Record<string, unknown>;
}
