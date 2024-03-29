import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
class RulePairDto {
  @IsNotEmpty()
  @IsNumber()
  ruleNumber: number;

  @IsNotEmpty()
  @IsString()
  ruleTitle: string;

  @IsNotEmpty()
  @IsString()
  ruleDetail: string;
}

export class CreateRuleDto {
  @IsNotEmpty()
  @IsString()
  mainTitle: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RulePairDto)
  rulePairs: RulePairDto[];

  @IsNotEmpty()
  @IsArray()
  @IsNumber({}, { each: true })
  membersId: number[];
}
