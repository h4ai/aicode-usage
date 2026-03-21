import { IsOptional, IsString, IsEnum, IsArray } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QuerySkillsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

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
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(['PUBLIC', 'DEPARTMENT', 'PRIVATE'])
  visibility?: string;

  @IsOptional()
  @IsString()
  sort?: string; // 'popular' | 'recent' | 'downloads'
}
