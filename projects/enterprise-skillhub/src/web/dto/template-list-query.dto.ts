import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum TemplateSortEnum {
  POPULAR = 'popular',
  NEWEST = 'newest',
  NAME = 'name',
}

export class TemplateListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsEnum(TemplateSortEnum)
  sort?: TemplateSortEnum = TemplateSortEnum.POPULAR;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  namespaceId?: string;
}
