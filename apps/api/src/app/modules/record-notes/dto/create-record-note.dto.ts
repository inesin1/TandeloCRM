import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateRecordNoteDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(5000)
  body!: string;
}
