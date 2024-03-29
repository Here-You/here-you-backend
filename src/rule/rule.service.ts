import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateRuleDto } from './dto/create-rule.dto';
import { RuleMainEntity } from './domain/rule.main.entity';
import { RuleSubEntity } from './domain/rule.sub.entity';
import { RuleInvitationEntity } from './domain/rule.invitation.entity';
import { UserEntity } from '../user/user.entity';
import {
  DetailMemberDto,
  DetailRuleDto,
  RulePairDto,
} from './dto/detail.rule.dto';
import { S3UtilService } from '../utils/S3.service';
import { GetMemberListDto } from './dto/get-member-list.dto';
import { UserService } from '../user/user.service';
import { GetRuleListDto, MemberPairDto } from './dto/get-rule-list.dto';
import { Like, MoreThan } from 'typeorm';
import { GetSearchMemberDto } from './dto/get-search-member.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { CursorPageOptionsDto } from './dto/cursor-page.options.dto';
import { CommentEntity } from '../comment/domain/comment.entity';
import { GetCommentDto } from './dto/get-comment.dto';
import { CursorPageDto } from './dto/cursor-page.dto';
import { CursorPageMetaDto } from './dto/cursor-page.meta.dto';
import { GetSearchMemberAtCreateDto } from './dto/get-search-member-at-create.dto';
import { UserFollowingEntity } from '../user/user.following.entity';

@Injectable()
export class RuleService {
  constructor(
    private readonly s3Service: S3UtilService,
    private readonly userService: UserService,
  ) {}

  // [1] 여행 규칙 생성
  async createRule(dto: CreateRuleDto, userId: number): Promise<number> {
    try {
      // 사용자 검증
      const inviterEntity = await UserEntity.findOneOrFail({
        where: { id: userId },
      });
      if (!inviterEntity) throw new Error('사용자를 찾을 수 없습니다');

      // -1) main 저장
      const main = new RuleMainEntity();
      main.mainTitle = dto.mainTitle;
      await main.save();
      console.log(main);

      dto.rulePairs.sort((a, b) => a.ruleNumber - b.ruleNumber);

      // -2) rule 저장
      for (const pair of dto.rulePairs) {
        console.log('현재 저장하는 ruleNumber : ', pair.ruleNumber);
        const sub = new RuleSubEntity();
        sub.ruleTitle = pair.ruleTitle;
        sub.ruleDetail = pair.ruleDetail;
        sub.main = main;

        await sub.save();
      }

      // -3) invitation 저장
      await Promise.all(
        dto.membersId.map(async (memberId): Promise<RuleInvitationEntity> => {
          const ruleInvitationEntity = new RuleInvitationEntity();

          const userEntity = await UserEntity.findOne({
            where: { id: memberId },
          });
          if (!userEntity)
            throw new NotFoundException(
              '멤버로 초대한 회원을 찾을 수 없습니다',
            );
          if (userEntity.isQuit == true)
            throw new BadRequestException(
              '탈퇴한 회원은 멤버로 초대할 수 없습니다',
            );
          ruleInvitationEntity.rule = main;
          ruleInvitationEntity.member = userEntity;

          await ruleInvitationEntity.save();
          return ruleInvitationEntity;
        }),
      );

      // -4) 여행 규칙 글 작성자 정보 저장
      const writerEntity = new RuleInvitationEntity();

      writerEntity.member = inviterEntity;
      writerEntity.rule = main;
      await writerEntity.save();

      return main.id;
    } catch (e) {
      throw new Error(e.message);
    }
  }

  // [2] 여행 규칙 상세 페이지 조회 (게시글)
  async getDetail(userId: number, ruleId: number): Promise<DetailRuleDto> {
    const dto = new DetailRuleDto();

    try {
      // 검증1) 사용자가 존재하지 않는 경우
      const user = await UserEntity.findOne({
        where: { id: userId },
      });
      if (!user) throw new Error('사용자를 찾을 수 없습니다');

      // 검증2) 규칙이 존재하지 않는 경우
      const ruleMain = await RuleMainEntity.findOne({
        where: { id: ruleId },
        relations: { rules: true, invitations: { member: true } },
      });
      if (!ruleMain) throw new Error('규칙을 찾을 수 없습니다');

      // 검증3) 규칙에 참여하는 사용자인지 체크
      const invitation = await RuleInvitationEntity.findOne({
        where: { member: { id: userId }, rule: { id: ruleId } },
      });

      const subs: RuleSubEntity[] = await RuleSubEntity.find({
        where: { main: { id: ruleId } },
      });
      const invitations: RuleInvitationEntity[] =
        await RuleInvitationEntity.find({
          where: { rule: { id: ruleId } },
          relations: { member: { profileImage: true } },
        });

      if (!!invitation) {
        // -1) 제목
        dto.id = ruleId;
        dto.mainTitle = ruleMain.mainTitle;
        console.log('dto.id : ', dto.id);

        // -2) 규칙
        const rulePairs = await Promise.all(
          subs.map(async (sub): Promise<RulePairDto> => {
            const rulePair = new RulePairDto();
            rulePair.id = sub.id;
            rulePair.ruleTitle = sub.ruleTitle;
            rulePair.ruleDetail = sub.ruleDetail;
            console.log('rulePair.id', rulePair.id);

            return rulePair;
          }),
        );
        dto.rulePairs = rulePairs.sort((a, b) => a.id - b.id);

        // -3) 멤버 정보
        const detailMembers = await Promise.all(
          invitations.map(async (invitation): Promise<DetailMemberDto> => {
            const detailMember = new DetailMemberDto();
            const memberEntity = invitation.member;
            if (memberEntity.isQuit == false) {
              detailMember.id = memberEntity.id;
              detailMember.name = memberEntity.nickname;
              console.log('detailMember.id : ', detailMember.id);

              // 사용자 프로필 이미지
              const image = memberEntity.profileImage;
              if (image == null) detailMember.image = null;
              else {
                const userImageKey = image.imageKey;
                detailMember.image = await this.s3Service.getImageUrl(
                  userImageKey,
                );
              }
            }
            // 탈퇴한 회원인데 ruleInvitationEntity 삭제 안된 경우)
            else {
              console.log(
                '탈퇴한 회원의 ruleInvitationEntity 가 삭제되지 않았습니다',
              );
              console.log('탈퇴한 회원의 ID : ', memberEntity.id);
              console.log('해당 ruleInvitationEntity ID : ', invitation.id);
              detailMember.id = null;
              detailMember.name = null;
              detailMember.image = null;
            }

            return detailMember;
          }),
        );
        dto.detailMembers = detailMembers.sort((a, b) => a.id - b.id);

        return dto;
      } else {
        throw new Error('여행 규칙에 참여하는 사용자가 아닙니다');
      }
    } catch (e) {
      console.log('게시글 조회에 실패하였습니다');
      throw new Error(e.message);
    }
  }

  // [3] 여행 규칙 상세 페이지 조회 (댓글) - 페이지네이션
  async getComment(
    cursorPageOptionsDto: CursorPageOptionsDto,
    ruleId: number,
    userId: number,
  ): Promise<CursorPageDto<GetCommentDto>> {
    try {
      // 검증1) 사용자가 존재하지 않는 경우
      const user = await UserEntity.findOne({
        where: { id: userId },
      });
      if (!user) throw new Error('사용자를 찾을 수 없습니다');

      // 검증2) 규칙이 존재하지 않는 경우
      const ruleMain = await RuleMainEntity.findOne({
        where: { id: ruleId },
      });
      if (!ruleMain) throw new Error('규칙을 찾을 수 없습니다');

      // 검증3) 규칙에 참여하는 사용자가 아닌 경우
      const invitation = await RuleInvitationEntity.findOne({
        where: { member: { id: userId }, rule: { id: ruleId } },
      });
      if (!invitation) throw new Error('사용자가 참여하는 규칙이 아닙니다');

      console.log('--- 검증 완료 ---');

      // (1) 데이터 조회
      const cursorId: number = cursorPageOptionsDto.cursorId;

      const [comments, total] = await CommentEntity.findAndCount({
        take: cursorPageOptionsDto.take,
        where: {
          rule: { id: ruleId },
          id: cursorId ? MoreThan(cursorId) : null,
        },
        relations: { user: { profileImage: true } },
        order: {
          id: 'ASC' as any,
        },
      });

      const result = await Promise.all(
        comments.map(async (comment) => {
          const getCommentDto = new GetCommentDto();

          getCommentDto.id = comment.id;
          getCommentDto.content = comment.content;
          getCommentDto.updated = comment.updated;

          // 댓글 작성자 정보
          // 탈퇴한 사용자가 작성한 댓글도 표시
          // -> 댓글 작성자 (user) 존재 여부 확인
          const writerEntity = comment.user;
          if (writerEntity.isQuit == false) {
            getCommentDto.writerId = comment.user.id;
            getCommentDto.name = comment.user.nickname;

            // 사용자 프로필 이미지
            const image = comment.user.profileImage;
            if (image == null) getCommentDto.image = null;
            else {
              const userImageKey = image.imageKey;
              getCommentDto.image = await this.s3Service.getImageUrl(
                userImageKey,
              );
            }
          }
          // 댓글 작성자가 탈퇴한 사용자인 경우
          else {
            console.log('탈퇴한 회원이 작성한 댓글 입니다');
            getCommentDto.writerId = null;
            getCommentDto.name = null;
            getCommentDto.image = null;
          }

          return getCommentDto;
        }),
      );

      // (2) 페이징 및 정렬 기준 설정
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

      const cursorPageMetaDto = new CursorPageMetaDto({
        cursorPageOptionsDto,
        total,
        hasNextData,
        cursor,
      });

      return new CursorPageDto(result, cursorPageMetaDto);
    } catch (e) {
      throw new Error(e.message);
    }
  }

  // [4] 여행 규칙 나가기
  async deleteInvitation(
    ruleId: number,
    userId: number,
  ): Promise<RuleInvitationEntity> {
    try {
      // 검증1) 사용자가 존재하지 않는 경우
      const user = await UserEntity.findOne({
        where: { id: userId },
      });
      if (!user) throw new Error('사용자를 찾을 수 없습니다');

      // 검증2) 규칙이 존재하지 않는 경우
      const ruleMain = await RuleMainEntity.findOne({
        where: { id: ruleId },
      });
      if (!ruleMain) throw new Error('규칙을 찾을 수 없습니다');

      // 검증3) 규칙에 참여하는 사용자가 아닌 경우
      const invitation = await RuleInvitationEntity.findOne({
        where: { member: { id: userId }, rule: { id: ruleId } },
      });
      if (!!invitation) {
        return invitation.softRemove();
      } else throw new Error('사용자가 참여하는 규칙이 아닙니다');
    } catch (e) {
      console.log('여행 규칙 나가기 실패');
      throw new Error(e.message);
    }
  }

  // [4] 여행 규칙 멤버 리스트 조회
  async getMemberList(
    userId: number,
    ruleId: number,
  ): Promise<GetMemberListDto[]> {
    try {
      // 검증1) 사용자가 존재하지 않는 경우
      const user = await UserEntity.findOne({
        where: { id: userId },
      });
      if (!user) throw new Error('사용자를 찾을 수 없습니다');

      // 검증2) 규칙이 존재하지 않는 경우
      const ruleMain = await RuleMainEntity.findOne({
        where: { id: ruleId },
      });
      if (!ruleMain) throw new Error('규칙을 찾을 수 없습니다');

      // 검증3) 규칙에 참여하는 사용자가 아닌 경우
      const invitation = await RuleInvitationEntity.findOne({
        where: { member: { id: userId }, rule: { id: ruleId } },
      });

      if (!!invitation) {
        const invitationsList: RuleInvitationEntity[] =
          await RuleInvitationEntity.find({
            where: { rule: { id: ruleId } },
            relations: { member: true },
          });

        const membersList: GetMemberListDto[] = await Promise.all(
          invitationsList.map(async (invitation): Promise<GetMemberListDto> => {
            const memberEntity: UserEntity = invitation.member;
            const memberDto: GetMemberListDto = new GetMemberListDto();

            console.log('memberEntity : ', memberEntity);
            memberDto.id = memberEntity.id;
            memberDto.name = memberEntity.nickname;
            memberDto.email = memberEntity.email;
            memberDto.introduction = memberEntity.introduction;

            // 사용자 프로필 이미지
            const image = await this.userService.getProfileImage(
              memberEntity.id,
            );
            if (image == null) memberDto.image = null;
            else {
              const userImageKey = image.imageKey;
              memberDto.image = await this.s3Service.getImageUrl(userImageKey);
            }
            return memberDto;
          }),
        );
        const sortedList = membersList.sort((a, b) => a.id - b.id);
        return sortedList;
      } else throw new Error('사용자가 참여하는 규칙이 아닙니다');
    } catch (e) {
      throw new Error(e.message);
    }
  }

  // [5] 여행 규칙 전체 리스트 조회
  async getRuleList(userId: number): Promise<GetRuleListDto[]> {
    try {
      // 검증) 사용자가 존재하지 않는 경우
      const user = await UserEntity.findOne({
        where: {
          id: userId,
        },
        relations: {
          ruleParticipate: {
            rule: {
              invitations: {
                member: {
                  profileImage: true,
                },
              },
            },
          },
        },
      });
      console.log('현재 로그인한 사용자 : ', user.id);
      if (!user) throw new Error('사용자를 찾을 수 없습니다');

      const invitationEntities = await RuleInvitationEntity.find({
        where: { member: { id: userId } },
        relations: {
          rule: {
            invitations: true,
          },
        },
      });

      if (!!invitationEntities) {
        const getRuleListDtos = await Promise.all(
          invitationEntities.map(
            async (
              invitation: RuleInvitationEntity,
            ): Promise<GetRuleListDto> => {
              const ruleListDto: GetRuleListDto = new GetRuleListDto();
              const ruleId = invitation.rule.id;
              const ruleMain = invitation.rule;

              ruleListDto.id = ruleMain.id;
              ruleListDto.title = ruleMain.mainTitle;
              ruleListDto.updated = ruleMain.updated;
              ruleListDto.memberCnt = ruleMain.invitations.length;
              ruleListDto.memberPairs = await this.getMemberPairs(ruleId);

              return ruleListDto;
            },
          ),
        );

        const sortedGetRuleListDtos = getRuleListDtos.sort(
          (a, b) =>
            new Date(b.updated).getTime() - new Date(a.updated).getTime(),
        );

        return sortedGetRuleListDtos;
      }
    } catch (e) {
      console.log('참여하는 여행 규칙이 없습니다');
      throw new Error(e.message);
    }
  }

  async getMemberPairs(ruleId: number): Promise<MemberPairDto[]> {
    const invitations = await RuleInvitationEntity.find({
      where: { rule: { id: ruleId } },
      relations: {
        member: {
          profileImage: true,
        },
      },
    });

    const result: MemberPairDto[] = await Promise.all(
      invitations.map(async (invitation): Promise<MemberPairDto> => {
        const memberPair = new MemberPairDto();
        const user: UserEntity = invitation.member;

        console.log('user.id : ', user.id);
        memberPair.id = user.id;
        memberPair.name = user.nickname;

        // 사용자 프로필 이미지
        const image = user.profileImage;
        if (image == null) memberPair.image = null;
        else {
          const userImageKey = image.imageKey;
          memberPair.image = await this.s3Service.getImageUrl(userImageKey);
        }
        return memberPair;
      }),
    );
    return result;
  }

  // [6] 여행 규칙 참여 멤버로 초대할 메이트 검색 결과 - 무한 스크롤
  // 여행 규칙 생성 / 여행 규칙 수정 분리
  // case1. 여행 규칙 생성
  async getSearchMemberAtCreate(
    cursorPageOptionsDto: CursorPageOptionsDto,
    userId: number,
    searchTerm: string,
  ): Promise<CursorPageDto<GetSearchMemberAtCreateDto>> {
    try {
      // 검증1) 사용자가 존재하지 않는 경우
      const user = await UserEntity.findOne({
        where: {
          id: userId,
        },
      });
      if (!user) throw new Error('사용자를 찾을 수 없습니다');

      // (1) cursorId 설정
      let cursorId = 0;
      console.log('cursorPageOptionsDto : ', cursorPageOptionsDto);

      // -1) 처음 요청인 경우
      if (cursorPageOptionsDto.cursorId == 0) {
        const newUser = await UserEntity.find({
          order: {
            id: 'DESC', // 가장 최근에 가입한 유저
          },
          take: 1,
        });
        cursorId = newUser[0].id + 1;

        console.log('cursorPageOptionsDto.cursorId == 0 로 인식');
        console.log('cursor: ', cursorId);
        // -2) 처음 요청이 아닌 경우
      } else {
        cursorId = cursorPageOptionsDto.cursorId;
        console.log('cursorPageOptionsDto.cursorId != 0 로 인식');
      }
      console.log('cursor: ', cursorId);

      // (2) 데이터 조회
      // 검색 결과에 해당하는 값 찾기
      // [검색 조건]
      // 검색 기준 UserFollowingEntity : 검색 결과로 나와야 하는 사용자 (searchTerm 에 해당하는)
      // 해당 결과값을 nickName 에 포함하고 있는 사용자 찾기
      // 본인이 팔로우 하는 사용자 중에서만 검색이 가능하도록 (본인은 자동으로 검색 결과에서 제외)

      console.log('검색 값: ', searchTerm);

      // 조건에 맞는 유저 검색해서 [] 에 담고
      // 해당 리스트에서 UserEntity 의 id, cursorId 이용해서 가져오기

      // 1번 검색 조건) searchTerm 을 name 이나 nickname 에 포함하고 있는
      // 2번 검색 조건) 유저가 팔로우하는 유저
      // userFollowingEntity) user: 로그인한 유저, followUser: 유저가 팔로우하는 유저
      let resultFollowingEntities = await UserFollowingEntity.find({
        where: {
          user: { id: userId },
          followUser: { nickname: Like(`%${searchTerm}%`) },
        },
        relations: {
          followUser: { profileImage: true },
        },
        order: {
          followUser: { id: 'DESC' },
        },
      });
      console.log('resultFollowingEntities', resultFollowingEntities);

      // 3번 검색 조건) 탈퇴 여부 확인
      resultFollowingEntities = resultFollowingEntities.filter(
        (userFollowingEntity) => userFollowingEntity.followUser.isQuit == false,
      );
      for (const userFollowingEntity of resultFollowingEntities) {
        console.log(
          'isQuit == false : ',
          userFollowingEntity.followUser.isQuit,
        );
      }

      const total = resultFollowingEntities.length;

      // 4번 검색 조건) id 가 cursorId 보다 작은
      // 해당 요소보다 작은 요소들만 필터링
      for (const userFollowingEntity of resultFollowingEntities) {
        console.log(
          'userFollowingEntity.followUser.id : ',
          userFollowingEntity.followUser.id,
        );
      }

      resultFollowingEntities = resultFollowingEntities.filter(
        (userFollowingEntity) => userFollowingEntity.followUser.id < cursorId,
      );

      // take 초기값 설정
      console.log('cursorPageOptionsDto.take : ', cursorPageOptionsDto.take);
      if (cursorPageOptionsDto.take == 0) {
        cursorPageOptionsDto.take = 5;
      }
      const results = resultFollowingEntities.slice(
        0,
        cursorPageOptionsDto.take,
      );

      console.log('results (UserFollowingEntity[]) : ', results);

      const searchResult = await Promise.all(
        results.map(async (result) => {
          const dtoAtCreate: GetSearchMemberAtCreateDto =
            new GetSearchMemberAtCreateDto();
          const follower = result.followUser;

          dtoAtCreate.id = follower.id;
          dtoAtCreate.name = follower.nickname;
          dtoAtCreate.email = follower.email;
          dtoAtCreate.introduction = follower.introduction;

          // 사용자 프로필 이미지
          const image = follower.profileImage;
          if (image == null) dtoAtCreate.image = null;
          else {
            const followerImageKey = image.imageKey;
            dtoAtCreate.image = await this.s3Service.getImageUrl(
              followerImageKey,
            );
          }
          return dtoAtCreate;
        }),
      );

      console.log('searchResult : ', searchResult);

      // (3) 페이징 및 정렬 기준 설정
      let hasNextData = true;
      let cursor: number;

      const takePerScroll = cursorPageOptionsDto.take;
      console.log('takePerScroll : ', takePerScroll);
      const isLastScroll = total <= takePerScroll;
      console.log('isLastScroll : ', isLastScroll);
      console.log('total : ', total);
      const lastDataPerScroll = searchResult[searchResult.length - 1];

      if (isLastScroll) {
        hasNextData = false;
        cursor = null;
      } else {
        cursor = lastDataPerScroll.id;
      }

      const cursorPageMetaDto = new CursorPageMetaDto({
        cursorPageOptionsDto,
        total,
        hasNextData,
        cursor,
      });

      return new CursorPageDto(searchResult, cursorPageMetaDto);
    } catch (e) {
      throw new Error(e.message);
    }
  }

  // [6-2] case2. 여행 규칙 수정
  async getSearchMemberAtUpdate(
    cursorPageOptionsDto: CursorPageOptionsDto,
    userId: number,
    ruleId: number,
    searchTerm: string,
  ): Promise<CursorPageDto<GetSearchMemberDto>> {
    try {
      // 검증1) 사용자가 존재하지 않는 경우
      const user = await UserEntity.findOne({
        where: {
          id: userId,
        },
      });
      if (!user) throw new Error('사용자를 찾을 수 없습니다');
      // 검증2) 규칙이 존재하지 않는 경우
      const rule = await RuleMainEntity.findOne({
        where: { id: ruleId },
        relations: { rules: true, invitations: { member: true } },
      });
      if (!rule) throw new Error('규칙을 찾을 수 없습니다');
      // 검증3) 규칙에 참여하는 사용자인지 체크
      const invitation = await RuleInvitationEntity.findOne({
        where: { member: { id: userId }, rule: { id: ruleId } },
      });

      if (!invitation) throw new Error('규칙에 참여하지 않는 사용자 입니다');

      // (1) cursorId 설정
      let cursorId = 0;
      console.log('cursorPageOptionsDto : ', cursorPageOptionsDto);

      // -1) 처음 요청인 경우
      if (cursorPageOptionsDto.cursorId == 0) {
        const newUser = await UserEntity.find({
          order: {
            id: 'DESC', // 가장 최근에 가입한 유저
          },
          take: 1,
        });
        cursorId = newUser[0].id + 1;

        console.log('cursorPageOptionsDto.cursorId == 0 로 인식');
        console.log('cursor: ', cursorId);
        // -2) 처음 요청이 아닌 경우
      } else {
        cursorId = cursorPageOptionsDto.cursorId;
        console.log('cursorPageOptionsDto.cursorId != 0 로 인식');
      }
      console.log('cursor: ', cursorId);

      // (2) 데이터 조회
      // 검색 결과에 해당하는 값 찾기
      // [검색 조건]
      // 검색 기준 UserFollowingEntity : 검색 결과로 나와야 하는 사용자 (searchTerm 에 해당하는)
      // 해당 결과값을 nickName 에 포함하고 있는 사용자 찾기
      // 본인이 팔로우 하는 사용자 중에서만 검색이 가능하도록 (본인은 자동으로 검색 결과에서 제외)

      console.log('검색 값: ', searchTerm);

      // 조건에 맞는 유저 검색해서 [] 에 담고
      // 해당 리스트에서 UserEntity 의 id, cursorId 이용해서 가져오기

      // 1번 검색 조건) searchTerm 을 name 이나 nickname 에 포함하고 있는
      // 2번 검색 조건) 유저가 팔로우하는 유저
      // userFollowingEntity) user: 로그인한 유저, followUser: 유저가 팔로우하는 유저
      let resultFollowingEntities = await UserFollowingEntity.find({
        where: {
          user: { id: userId },
          followUser: { nickname: Like(`%${searchTerm}%`) },
        },
        relations: {
          followUser: { profileImage: true, ruleParticipate: { rule: true } },
        },
        order: {
          followUser: { id: 'DESC' },
        },
      });
      console.log('resultFollowingEntities', resultFollowingEntities);

      // 3번 검색 조건) 탈퇴 여부 확인
      resultFollowingEntities = resultFollowingEntities.filter(
        (userFollowingEntity) => userFollowingEntity.followUser.isQuit == false,
      );
      for (const userFollowingEntity of resultFollowingEntities) {
        console.log(
          'isQuit == false : ',
          userFollowingEntity.followUser.isQuit,
        );
      }

      const total = resultFollowingEntities.length;

      // 4번 검색 조건) id 가 cursorId 보다 작은
      // 해당 요소보다 작은 요소들만 필터링
      for (const userFollowingEntity of resultFollowingEntities) {
        console.log(
          'userFollowingEntity.followUser.id : ',
          userFollowingEntity.followUser.id,
        );
      }

      resultFollowingEntities = resultFollowingEntities.filter(
        (userFollowingEntity) => userFollowingEntity.followUser.id < cursorId,
      );

      // take 초기값 설정
      console.log('cursorPageOptionsDto.take : ', cursorPageOptionsDto.take);
      if (cursorPageOptionsDto.take == 0) {
        cursorPageOptionsDto.take = 5;
      }
      const results = resultFollowingEntities.slice(
        0,
        cursorPageOptionsDto.take,
      );

      console.log('results (UserFollowingEntity[]) : ', results);

      // dto 데이터 넣기
      const searchResult = await Promise.all(
        results.map(async (result) => {
          const dto: GetSearchMemberDto = new GetSearchMemberDto();
          const follower = result.followUser;

          dto.id = follower.id;
          dto.name = follower.nickname;
          dto.email = follower.email;
          dto.introduction = follower.introduction;
          // 이미 여행 규칙에 참여하는 멤버인지 여부
          dto.isInvited = await this.userService.checkAlreadyMember(
            follower.id,
            ruleId,
          );

          // 사용자 프로필 이미지
          const image = follower.profileImage;
          if (image == null) dto.image = null;
          else {
            const followerImageKey = image.imageKey;
            dto.image = await this.s3Service.getImageUrl(followerImageKey);
          }
          return dto;
        }),
      );

      console.log('searchResult : ', searchResult);

      // (3) 페이징 및 정렬 기준 설정
      let hasNextData = true;
      let cursor: number;

      const takePerScroll = cursorPageOptionsDto.take;
      const isLastScroll = total <= takePerScroll;
      const lastDataPerScroll = searchResult[searchResult.length - 1];

      if (isLastScroll) {
        hasNextData = false;
        cursor = null;
      } else {
        cursor = lastDataPerScroll.id;
      }

      const cursorPageMetaDto = new CursorPageMetaDto({
        cursorPageOptionsDto,
        total,
        hasNextData,
        cursor,
      });

      return new CursorPageDto(searchResult, cursorPageMetaDto);
    } catch (e) {
      throw new Error(e.message);
    }
  }

  // [7] 여행 규칙 수정
  async updateRule(
    updateRuleDto: UpdateRuleDto,
    userId: number,
    ruleId: number,
  ): Promise<number> {
    try {
      // 검증1) 사용자가 존재하지 않는 경우
      const user = await UserEntity.findOne({
        where: { id: userId },
      });
      if (!user) throw new Error('사용자를 찾을 수 없습니다');

      // 검증2) 규칙이 존재하지 않는 경우
      const rule = await RuleMainEntity.findOne({
        where: { id: ruleId },
        relations: { rules: true, invitations: { member: true } },
      });
      if (!rule) throw new Error('규칙을 찾을 수 없습니다');

      // 검증3) 규칙에 참여하는 사용자인지 체크
      const invitation = await RuleInvitationEntity.findOne({
        where: { member: { id: userId }, rule: { id: ruleId } },
      });
      // -> 규칙에 참여하는 사용자인 경우
      if (!!invitation) {
        updateRuleDto.rulePairs.sort((a, b) => a.ruleNumber - b.ruleNumber);

        rule.mainTitle = updateRuleDto.mainTitle;
        await rule.save();

        // (1) [상세 규칙 수정]
        // 기존 세부 규칙 정보 리스트
        const subs = rule.rules;

        // 새로운 세부 규칙 리스트
        const updateSubsList = updateRuleDto.rulePairs;
        updateSubsList.sort((a, b) => a.ruleNumber - b.ruleNumber);

        // case1) 규칙 삭제
        for (const sub of subs) {
          let isDeleteSub = true;
          for (const updateSub of updateSubsList) {
            if (sub.id == updateSub.id) {
              isDeleteSub = false;
              break;
            }
          }
          if (isDeleteSub) {
            await sub.softRemove();
            console.log('삭제하는 sub 규칙 : ', sub.id);
          }
        }

        // case2) 규칙 수정 및 규칙 추가
        for (const updateSub of updateSubsList) {
          // case1) 새로운 규칙
          if (!updateSub.id) {
            const newSub = new RuleSubEntity();
            newSub.main = rule;
            newSub.ruleTitle = updateSub.ruleTitle;
            newSub.ruleDetail = updateSub.ruleDetail;

            await newSub.save();
            console.log('새로 저장하는 sub 규칙 : ', newSub.id);
          }
          // case2) 수정 규칙
          else {
            const oldSub = await RuleSubEntity.findOne({
              where: { id: updateSub.id },
            });
            oldSub.ruleTitle = updateSub.ruleTitle;
            oldSub.ruleDetail = updateSub.ruleDetail;

            await oldSub.save();
            console.log('수정하는 규칙 ID : ', oldSub);
          }
        }

        // (2) [여행 규칙 멤버 수정]
        // 기존 멤버 초대 리스트
        const oldInvitations = await RuleInvitationEntity.find({
          where: { rule: { id: ruleId } },
          relations: { member: true },
        });
        // 수정된 멤버 ID 리스트
        const updateMemberIds = updateRuleDto.membersId;

        // case1) 멤버 삭제
        for (const invitation of oldInvitations) {
          const member = invitation.member;
          let isDeleteMember = true;

          // (예외 상황) 현재 로그인한 사용자
          if (member.id == userId) break;

          for (const updateMemberId of updateMemberIds) {
            if (member.id == updateMemberId) {
              isDeleteMember = false;
              break;
            }
          }
          if (isDeleteMember) {
            await invitation.softRemove();
            console.log('삭제하는 멤버 ID : ', invitation.id);
          }
        }

        // case2) 멤버 추가
        for (const updateMemberId of updateMemberIds) {
          await UserEntity.findExistUser(updateMemberId);

          let isPostMember = true;

          for (const oldInvitation of oldInvitations) {
            const oldMember = oldInvitation.member;
            if (oldMember.id == updateMemberId) {
              isPostMember = false;
              break;
            }
          }

          if (isPostMember) {
            const newInvitation = new RuleInvitationEntity();

            newInvitation.member = await UserEntity.findExistUser(
              updateMemberId,
            );
            newInvitation.rule = rule;

            await newInvitation.save();
            console.log('새로 초대한 멤버 ID : ', updateMemberId);
          }
        }
        console.log('--여행 규칙 수정이 완료되었습니다--');
        return rule.id;
      } else throw new Error('사용자가 참여하는 규칙이 아닙니다'); // -> 여행 규칙에 참여하지 않는 경우
    } catch (e) {
      console.log('여행 규칙 수정 실패');
      throw new Error(e.message);
    }
  }
}
