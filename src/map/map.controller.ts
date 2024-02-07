import { MapService } from './map.service';
import { Controller, Param, Req, UseGuards, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { UserGuard } from 'src/user/user.guard';
import { MonthInfoDto } from './month-info.dto';
@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  /*여정 불러오기*/
  @ApiOperation({
    summary: '여정 불러오기',
    description: '여정 제목, 날짜, 위치, 사진을 불러옵니다.',
  })
  @ApiOkResponse({
    description: '성공 ',
  })
  @Get('get-journey/:journeyId')
  async getJourneyPreview(@Param('journeyId') journeyId: number) {
    const result = await this.mapService.getJourneyPreview(journeyId);
    return result;
  }

  /*월별 여정 불러오기*/
  @ApiOperation({
    summary: '월별 여정 불러오기',
    description: '월별 여정 리스트 - 제목, 날짜, 일지 개수를 불러옵니다.',
  })
  @ApiOkResponse({
    description: '성공 ',
  })
  @UseGuards(UserGuard)
  @Get('get-monthly-journey/:year/:month')
  async getMonthlyJourney(
    @Param('year') year: number,
    @Param('month') month: number,
    @Req() req: Request,
  ) {
    const user = req.user;
    const monthInfoDto: MonthInfoDto = {
      year,
      month,
    };
    const result = await this.mapService.getMonthlyJourneyMap(
      user.id,
      monthInfoDto,
    );
    return result;
  }

  /*일지 불러오기 - 지도 */
  @ApiOperation({
    summary: '일지 불러오기 - 지도',
    description: 'journeyId로 일지 불러오기',
  })
  @ApiOkResponse({
    description: '성공 ',
  })
  @Get('get-diaries/:journeyId')
  async getDiaryList(@Param('journeyId') journeyId: number) {
    const result = await this.mapService.getDiaryList(journeyId);
    return result;
  }
}