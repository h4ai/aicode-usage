import { IsString, IsEnum, IsOptional, IsUrl, MinLength, MaxLength } from 'class-validator';

export enum GitAuthType {
  SSH_KEY = 'SSH_KEY',
  TOKEN = 'TOKEN',
  BASIC = 'BASIC',
}

export enum CredentialScope {
  PERSONAL = 'PERSONAL',
  NAMESPACE = 'NAMESPACE',
  GLOBAL = 'GLOBAL',
}

export class CreateCredentialDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsEnum(GitAuthType)
  type: GitAuthType;

  @IsString()
  @MinLength(1)
  url: string;

  @IsString()
  @MinLength(1)
  credential: string;

  @IsEnum(CredentialScope)
  @IsOptional()
  scope?: CredentialScope = CredentialScope.PERSONAL;
}
