import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';
import { LEAD_STATUSES } from '../lead.entity';

export class CreateLeadDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({ enum: LEAD_STATUSES, default: 'new' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(LEAD_STATUSES)
  status?: (typeof LEAD_STATUSES)[number];

  @ApiPropertyOptional({ default: 0 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  price?: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  ownerId?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  companyName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  contactName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  source?: string | null;
}
