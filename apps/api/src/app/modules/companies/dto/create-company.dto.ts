import {
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  industry?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsInt()
  ownerId?: number | null;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsObject()
  customFields?: Record<string, unknown>;
}
