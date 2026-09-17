import { IsIn, ValidateIf } from 'class-validator';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CustomFieldEntityType,
} from '../custom-field.entity';

export class FindCustomFieldsDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(CUSTOM_FIELD_ENTITY_TYPES)
  entityType?: CustomFieldEntityType;
}
