import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomFieldDto } from './create-custom-field.dto';

export class UpdateCustomFieldDto extends PartialType(CreateCustomFieldDto, {
  skipNullProperties: false,
}) {}
