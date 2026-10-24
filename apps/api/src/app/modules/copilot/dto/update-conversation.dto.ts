import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  title!: string;
}
