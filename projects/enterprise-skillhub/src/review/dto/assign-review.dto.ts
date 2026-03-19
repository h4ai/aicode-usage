import { IsOptional, IsString } from 'class-validator';

export class AssignReviewDto {
  @IsOptional()
  @IsString()
  assigneeId?: string;
}
