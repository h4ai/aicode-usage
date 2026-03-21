import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  namespaceId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
