import { IsEnum, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';

export enum ReviewDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
}

export class ReviewDecisionDto {
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  reviewScore?: number;
}
