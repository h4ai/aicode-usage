import { IsString, IsEnum } from 'class-validator';

export enum NamespaceRoleDto {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export class AddMemberDto {
  @IsString()
  userId: string;

  @IsEnum(NamespaceRoleDto)
  role: NamespaceRoleDto = NamespaceRoleDto.MEMBER;
}
