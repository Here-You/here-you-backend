import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class GetMemberListDto {
  @IsNotEmpty()
  @IsNumber()
  id: number;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  introduction: string;

  @IsOptional()
  @IsString()
  image: string;
}
