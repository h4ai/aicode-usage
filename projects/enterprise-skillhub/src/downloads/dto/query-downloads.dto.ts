import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export enum ResourceTypeEnum {
  SKILL = 'SKILL',
  TEMPLATE = 'TEMPLATE',
}

export enum DownloadSourceEnum {
  CLI = 'CLI',
  WEB = 'WEB',
  API = 'API',
}

export enum PeriodEnum {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  ALL = 'all',
}

export class QueryTopResourcesDto {
  @IsOptional()
  @IsEnum(PeriodEnum)
  period?: PeriodEnum = PeriodEnum.WEEK;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class QueryDownloadTrendDto {
  @IsEnum(ResourceTypeEnum)
  resourceType!: ResourceTypeEnum;

  @IsString()
  resourceId!: string;

  @IsOptional()
  @IsEnum(PeriodEnum)
  period?: PeriodEnum = PeriodEnum.MONTH;
}

export class QueryUserDownloadsDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class QueryAdminDownloadLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsEnum(ResourceTypeEnum)
  resourceType?: ResourceTypeEnum;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(DownloadSourceEnum)
  source?: DownloadSourceEnum;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  format?: string; // 'csv' for CSV export
}

export class RecordDownloadDto {
  userId!: string;
  resourceType!: ResourceTypeEnum;
  resourceId!: string;
  resourceName!: string;
  version!: string;
  source?: DownloadSourceEnum;
  ip?: string;
  userAgent?: string;
}
