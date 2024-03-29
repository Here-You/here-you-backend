// mate-recommend-profile.dto.ts

import { MateSignatureCoverDto } from './mate-signature-cover.dto';

export class MateRecommendProfileDto {
  _id: number;
  mateImage: string; // 유저 사진
  mateName: string; // 유저 별명
  is_followed: boolean; // 팔로우 여부
  introduction: string; // 한 줄 소개
  signatures: MateSignatureCoverDto[];
}
