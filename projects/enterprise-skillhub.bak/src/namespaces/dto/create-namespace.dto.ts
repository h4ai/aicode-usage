import { IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';

export class CreateNamespaceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'Name must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric',
  })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
