import { Injectable, HttpException } from '@nestjs/common';
import { MemberListConverter } from './member.list.converter';
import { MemberDto } from './dto/member.dto';
import { RuleMemberEntity } from 'src/rule/domain/rule.member.entity';
import { RuleService } from 'src/rule/rule.service';

@Injectable()
export class MemberService {
    constructor(
        private memberListConverter: MemberListConverter,
        private ruleService: RuleService,
    ) {}

    // [1] 여행 규칙 멤버 리스트 조회
    async getMemberList(userId: number, ruleId: number): Promise<MemberDto[]> {
        const memberDto: MemberDto[] = await this.memberListConverter.toDto(userId, ruleId);

        return memberDto;
    }

    // [2] 여행 규칙 멤버 초대
    async createInvitation(ruleId: number, userId: number, invitedId: number): Promise<RuleMemberEntity> {
  
        // invitation 객체 생성
        const invitation = RuleMemberEntity.create({
            rule: { id : ruleId },
            inviter: { id : userId},
            invited: { id : invitedId},
        })
        return invitation.save();
    }
    
    // [3] 여행 규칙 멤버 삭제
    async deleteMember(ruleId: number, memberId: number): Promise<RuleMemberEntity> {
        const invitation : RuleMemberEntity = await RuleMemberEntity.findInvitationByRuleId(ruleId, memberId);

        return invitation.softRemove();
    }
}