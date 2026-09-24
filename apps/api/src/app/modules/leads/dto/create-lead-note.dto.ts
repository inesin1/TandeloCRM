import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateLeadNoteDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(5000)
  body!: string;
}
