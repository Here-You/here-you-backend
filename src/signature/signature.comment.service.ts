// signature.comment.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { S3UtilService } from '../utils/S3.service';
import { SignatureService } from './signature.service';
import { CreateCommentDto } from './dto/comment/create-comment.dto';
import { SignatureCommentEntity } from './domain/signature.comment.entity';
import { UserEntity } from '../user/user.entity';
import { SignatureEntity } from './domain/signature.entity';
import { CursorPageOptionsDto } from '../rule/dto/cursor-page.options.dto';
import { CommentEntity } from '../comment/domain/comment.entity';
import { MoreThan } from 'typeorm';
import { GetCommentDto } from '../rule/dto/get-comment.dto';
import { GetSignatureCommentDto } from './dto/comment/get-signature-comment.dto';
import { GetCommentWriterDto } from './dto/comment/get-comment-writer.dto';
import * as querystring from 'querystring';
import { CursorPageMetaDto } from '../mate/cursor-page/cursor-page.meta.dto';
import { CursorPageDto } from '../mate/cursor-page/cursor-page.dto';

@Injectable()
export class SignatureCommentService{

  constructor(
    private readonly signatureService: SignatureService,
    private readonly userService: UserService,
    private readonly s3Service: S3UtilService,
  ) {}

  async createSignatureComment( // 댓글, 답글 생성하기
    createCommentDto: CreateCommentDto,
    userId: number,
    signatureId: number,
    parentCommentId?: number){

    const comment = new SignatureCommentEntity();

    const user = await UserEntity.findOneOrFail({ where: { id: userId }});
    const signature = await SignatureEntity.findOneOrFail( { where: { id: signatureId }});


    if( !user || !signature ) {
      throw new NotFoundException('404 Not Found');
    }
    else {

      comment.user = user;
      comment.signature = signature;
      comment.content = createCommentDto.content;

      // parentCommentId가 존재할 경우 -> 답글 / 존재하지 않을 경우 -> 댓글
      if(parentCommentId){  // 대댓글: parentId는 파라미터로 받은 parentCommentId로 설정

        const parentComment = await SignatureCommentEntity.findOneOrFail( {
          where:{ id: parentCommentId
          }});

        if( !parentComment ) throw new NotFoundException('404 Not Found');
        else {
          comment.parentComment = parentComment;
          await comment.save();
        }

      }
      else{  // 댓글: parentId는 본인으로 설정
        const savedComment = await comment.save();
        savedComment.parentComment = savedComment;
        await savedComment.save();
      }

      return comment.id;
    }
  }

  async getSignatureComment(  // 댓글 가져오기
    cursorPageOptionsDto: CursorPageOptionsDto,
    userId: number,
    signatureId: number,
  ) {

    // 1. 'cursorId'부터 오름차순 정령된 댓글 'take'만큼 가져오기
    const [comments, total] = await SignatureCommentEntity.findAndCount({
      take: cursorPageOptionsDto.take,
      where: {
        signature: { id: signatureId },
        parentComment: { id: cursorPageOptionsDto.cursorId ? MoreThan(cursorPageOptionsDto.cursorId) : null },
      },
      relations: {
        user: { profileImage: true },
        parentComment: true
      },
      order: {
        parentComment: { id: "ASC" as any,},
      },
    });

    // 2. 댓글 response dto에 담기
    const result = await Promise.all(comments.map(async (comment) => {
      const writerProfile = new GetCommentWriterDto();
      const getCommentDto = new GetSignatureCommentDto();

      // 2-[1] 댓글 작성자 정보 담기
      writerProfile._id = comment.user.id;
      writerProfile.name = comment.user.nickname;

      // 로그인한 사용자가 댓글 작성자인지 확인
      if( userId == comment.user.id ) writerProfile.is_writer = true;
      else writerProfile.is_writer = false;

      // 작성자 프로필 이미지
      const image = comment.user.profileImage;
      if(image == null) writerProfile.image = null;
      else {
        const userImageKey = image.imageKey;
        writerProfile.image = await this.s3Service.getImageUrl(userImageKey);
      }

      // 2-[2] 댓글 정보 담기
      getCommentDto._id = comment.id;
      getCommentDto.content = comment.content;
      getCommentDto.parentId = comment.parentComment.id;
      getCommentDto.writer = writerProfile;
      getCommentDto.date = await SignatureEntity.formatDateString(comment.updated);

      // 댓글 수정 여부 구하기
      if(comment.created != comment.updated) getCommentDto.is_edited = false;
      else getCommentDto.is_edited = true;

      return getCommentDto;

    }));

    // 3. 스크롤 설정
    let hasNextData = true;
    let cursor: number;

    const takePerScroll = cursorPageOptionsDto.take;
    const isLastScroll = total <= takePerScroll;
    const lastDataPerScroll = comments[comments.length - 1];

    if (isLastScroll) {
      hasNextData = false;
      cursor = null;
    } else {
      cursor = lastDataPerScroll.id;
    }

    const cursorPageMetaDto = new CursorPageMetaDto(
      { cursorPageOptionsDto, total, hasNextData, cursor });

    return new CursorPageDto( result, cursorPageMetaDto );


  }
}