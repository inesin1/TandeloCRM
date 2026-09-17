import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPES,
  CustomFieldEntityType,
  CustomFieldType,
} from '../custom-field.entity';

export class CreateCustomFieldDto {
  @IsIn(CUSTOM_FIELD_ENTITY_TYPES)
  entityType!: CustomFieldEntityType;

  @IsString()
  @Matches(/\S/)
  key!: string;

  @IsString()
  @Matches(/\S/)
  label!: string;

  @IsIn(CUSTOM_FIELD_TYPES)
  type!: CustomFieldType;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  options?: string[] | null;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  isRequired?: boolean;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  sortOrder?: number;
}
