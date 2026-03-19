import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  MaxLength,
} from 'class-validator';

export class UpdateSkillDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

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

  @IsOptional()
  badges?: Record<string, unknown>;
}
