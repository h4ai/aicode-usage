import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  Matches,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateSkillDto {
  @IsString()
  @Length(1, 128)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'slug must be lowercase alphanumeric with hyphens, 3-64 chars',
  })
  @Length(3, 64)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  summary?: string;

  @IsOptional()
  @IsEnum(
    [
      'GENERAL',
      'DEVELOPMENT',
      'DEVOPS',
      'DATA',
      'SECURITY',
      'OFFICE',
      'MULTIMEDIA',
      'SEARCH',
      'BROWSER',
      'COMMUNICATION',
      'CUSTOM',
    ],
    { message: 'Invalid category' },
  )
  category?: string;

  @IsOptional()
  @IsEnum(['PUBLIC', 'DEPARTMENT', 'PRIVATE'], {
    message: 'Invalid visibility',
  })
  visibility?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
