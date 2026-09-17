import {
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateContactDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  position?: string | null;

  @IsOptional()
  @IsInt()
  companyId?: number | null;

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
