import { ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Controller, Post, Body, Param } from '@nestjs/common';
import { DiaryService } from './diary.service';
import { CreateDiaryInfoDto } from './dtos/diary-info-dto';

@Controller('api/diary')
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  @ApiOperation({
    summary: '일지 작성하기',
    description: '일지를 작성하고 저장한 상태',
  })
  @ApiOkResponse({
    description: '성공 ',
  })
  @Post('create/:scheduleId')
  async createJourney(
    @Param('scheduleId') scheduleId: number,
    @Body() createDiaryInfoDto: CreateDiaryInfoDto,
  ) {
    const result = await this.diaryService.createDiary(
      scheduleId,
      createDiaryInfoDto,
    );
    return result;
  }
}
