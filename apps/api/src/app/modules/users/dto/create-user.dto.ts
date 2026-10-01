import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @IsInt({ each: true })
  roleIds!: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  groupIds?: number[];
}
