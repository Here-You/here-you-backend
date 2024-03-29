// search.service.ts

import { Injectable } from '@nestjs/common';
import { SignatureEntity } from '../signature/domain/signature.entity';
import { SignatureCoverDto } from './dto/signature-cover.dto';
import { SignaturePageEntity } from '../signature/domain/signature.page.entity';
import { UserService } from '../user/user.service';
import { Like } from 'typeorm';
import { S3UtilService } from '../utils/S3.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly userService: UserService,
    private readonly s3Service: S3UtilService,
  ) {}

  async findHotSignatures(): Promise<SignatureCoverDto[]> {
    try {
      /*****************************************
       인기 시그니처 알고리즘 로직:
       [1] 최근 일주일 안에 올라온 시그니처 모두 가져오기
       [2] 그 중에서 좋아요 개수 상위 20개 리턴
       *****************************************/

      // [1] 최근 일주일 안에 올라온 시그니처 가져오기
      const recentSignatures: SignatureEntity[] =
        await SignatureEntity.findRecentSignatures();

      // [2] 최근 시그니처들 리스트 좋아요 순으로 정렬
      recentSignatures.sort((a, b) => b.liked - a.liked);
      console.log(recentSignatures);

      // [3] 그 중에서 20개만 리턴한다
      return await this.getSignatureCoversForSearchMain(recentSignatures);
    } catch (error) {
      console.log('Error on findHotSignatures: ', error);
      throw error;
    }
  }

  async findMatesNewSignatures(userId: number) {
    try {
      /********************************************************
       내 메이트 최신 시그니처 로직:
        [1] 내가 팔로우하고 있는 메이트 목록 가져오기
        [2] 각 메이트가 작성한 시그니처 중 20일 안으로 작성된 것 가져오기
        [3] 최신순으로 정렬해서 20개만 리턴
      ********************************************************/

      // [1] 내가 팔로우하고 있는 메이트 목록 가져오기
      const followingMates = await this.userService.findFollowingMates(userId);

      // [2] 각 메이트들이 작성한 시그니처 목록에 담기
      const totalNewSignatures: SignatureEntity[] = [];
      for (const mate of followingMates) {
        const mateNewSignatures: SignatureEntity[] =
          await SignatureEntity.findNewSignaturesByUser(mate.id);

        for (const newSignature of mateNewSignatures) {
          totalNewSignatures.push(newSignature);
        }
      }

      // [3] 최신 순으로 정렬
      totalNewSignatures.sort(
        (a, b) => b.created.getTime() - a.created.getTime(),
      );

      // [4] 20개만 리턴
      return await this.getSignatureCoversForSearchMain(totalNewSignatures);
    } catch (error) {
      console.log('Error on FindMatesNewSigs: ' + error);
      throw error;
    }
  }

  async getSignatureCoversForSearchMain(signatureEntities) {
    // 탐색 메인화면에 출력될 시그니처 커버 20개 만들기
    const signatureCovers: SignatureCoverDto[] = [];

    for (let i = 0; i < signatureEntities.length && i < 20; i++) {
      const signature = signatureEntities[i];
      const signatureCover = await this.getSignatureCover(signature);
      if (signatureCover) signatureCovers.push(signatureCover);
    }

    return signatureCovers;
  }

  async searchByKeyword(keyword: string) {
    // 키워드로 검색하기: 탈퇴한 메이트의 시그니처도 반환
    try {
      const resultSignatures = await SignatureEntity.find({
        where: { title: Like(`%${keyword}%`) },
        relations: ['user'], // user 포함
      });

      const resultCovers = [];

      // 검색 결과 최신 순으로 정렬
      resultSignatures.sort(
        (a, b) => b.created.getTime() - a.created.getTime(),
      );

      for (const signature of resultSignatures) {
        const signatureCover = await this.getSignatureCover(signature);
        if (signatureCover) resultCovers.push(signatureCover);
      }
      return resultCovers;
    } catch (error) {
      console.log('검색 서비스 에러발생: ' + error);
      throw error;
    }
  }

  async getSignatureCover(
    signature: SignatureEntity, // 시그니처 커버 만들기
  ): Promise<SignatureCoverDto> {
    const signatureCover = new SignatureCoverDto();

    signatureCover._id = signature.id;
    signatureCover.title = signature.title;
    signatureCover.liked = signature.liked;
    signatureCover.userName = signature.user.nickname;

    // 시그니처 썸네일 이미지 가져오기
    signatureCover.date = await SignatureEntity.formatDateString(
      signature.created,
    );

    const signatureImageKey = await SignaturePageEntity.findThumbnail(
      signature.id,
    );
    if (signatureImageKey != null) {
      signatureCover.image = await this.s3Service.getImageUrl(
        signatureImageKey,
      );
    } else return null;

    // 시그니처 작성자 프로필 이미지 가져오기
    const userProfileImageEntity = await this.userService.getProfileImage(
      signature.user.id,
    );
    if (userProfileImageEntity == null) signatureCover.userImage = null;
    else {
      const userProfileImageKey = userProfileImageEntity.imageKey;
      signatureCover.userImage = await this.s3Service.getImageUrl(
        userProfileImageKey,
      );
    }
    return signatureCover;
  }
}
