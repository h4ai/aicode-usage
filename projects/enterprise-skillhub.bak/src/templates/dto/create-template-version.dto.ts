import { IsString, IsOptional, IsObject, IsArray } from 'class-validator';

export class CreateTemplateVersionDto {
  @IsString()
  version: string;

  @IsOptional()
  @IsObject()
  manifest?: Record<string, any>;

  @IsOptional()
  @IsString()
  extends?: string;

  @IsOptional()
  @IsArray()
  skills?: Array<{ skillName: string; versionRange: string }>;
}
