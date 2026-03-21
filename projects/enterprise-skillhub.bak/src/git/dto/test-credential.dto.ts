import { IsString, IsUrl, IsOptional } from 'class-validator';

export class TestCredentialDto {
  @IsString()
  @IsOptional()
  url?: string; // Override the saved URL if provided
}
