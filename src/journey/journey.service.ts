// journey.service.ts
import { Injectable } from '@nestjs/common';
import { addDays, isAfter, isEqual } from 'date-fns';
import { JourneyEntity } from './model/journey.entity';
import { errResponse, response } from 'src/response/response';
import { BaseResponse } from 'src/response/response.status';
import { ScheduleEntity } from 'src/schedule/schedule.entity';
import { CreateJourneyDto } from './dtos/create-journey.dto';
import { DetailScheduleEntity } from 'src/detail-schedule/detail-schedule.entity';
import { DiaryEntity } from 'src/diary/models/diary.entity';
import { UserEntity } from 'src/user/user.entity';
import { DiaryImageEntity } from 'src/diary/models/diary.image.entity';

@Injectable()
export class JourneyService {
  //여정 생성하기 - 일정, 일지 함께 생성
  async createJourney(user, createJourneyDto: CreateJourneyDto) {
    const existJourney = await JourneyEntity.findExistJourneyByPeriod(
      user.id,
      createJourneyDto,
    );
    if (existJourney) {
      return errResponse(BaseResponse.JOURNEY_DUPLICATION);
    }
    //여정 제목, 날짜 저장하기
    const journey = await JourneyEntity.createJourney(user, createJourneyDto);

    //일정 배너 생성하기 : (startDate - endDate + 1)개
    //일정 배너 생성하기 : (startDate - endDate + 1)개
    const startDate = new Date(createJourneyDto.startDate);
    const endDate = new Date(createJourneyDto.endDate);

    await this.createSchedules(journey, startDate, endDate);

    return errResponse(BaseResponse.JOURNEY_CREATED);
  }
  private async createSchedules(
    journey: JourneyEntity,
    startDate: Date,
    endDate: Date,
  ) {
    const schedules = [];

    // startDate와 endDate가 같은 경우 하나의 schedule 생성
    if (isEqual(startDate, endDate)) {
      const schedule = await ScheduleEntity.createSchedule(journey, startDate);
      schedules.push(schedule);
    } else {
      let currentDate = startDate;
      // endDate가 startDate 이후인지 확인하여 일정 배너 생성
      if (isAfter(endDate, startDate)) {
        while (currentDate <= endDate) {
          const schedule = await ScheduleEntity.createSchedule(
            journey,
            currentDate,
          );
          schedules.push(schedule);
          currentDate = addDays(currentDate, 1); // 다음 날짜로 이동
        }
      }
    }
    return schedules;
  }

  //여정 수정하기
  async updateJourney(user, journeyId: number, title: string) {
    const existUser = await UserEntity.findExistUser(user.id);
    const journey = await JourneyEntity.findExistJourneyByOptions(
      existUser.id,
      journeyId,
    );
    if (!journey) {
      return errResponse(BaseResponse.JOURNEY_NOT_FOUND);
    }
    if (title === null) {
      await JourneyEntity.updateJourney(journey, '');
      return response(BaseResponse.UPDATE_JOURNEY_TITLE_SUCCESS);
    }
    await JourneyEntity.updateJourney(journey, title);
    return response(BaseResponse.UPDATE_JOURNEY_TITLE_SUCCESS);
  }

  //여정 삭제하기 - 일정, 일지,

  async deleteJourney(journeyId: number) {
    const journey = await JourneyEntity.findExistJourney(journeyId);
    const schedules = await ScheduleEntity.findExistSchedulesByJourneyId(
      journey.id,
    );
    for (const schedule of schedules) {
      await this.deleteScheduleRelations(schedule);
    }

    await JourneyEntity.deleteJourney(journey);
    return response(BaseResponse.DELETE_JOURNEY_SUCCESS);
  }
  async deleteScheduleRelations(schedule) {
    const deleteSchedule = await ScheduleEntity.findExistSchedule(schedule.id);

    //세부 일정 지우기
    const detailSchedules =
      await DetailScheduleEntity.findExistDetailByScheduleId(schedule);
    for (const detailSchedule of detailSchedules) {
      await DetailScheduleEntity.deleteDetailSchedule(detailSchedule);
    }

    //일정 지우기
    const diary = await DiaryEntity.findExistDiaryByScheduleId(schedule.id);
    if (diary) {
      await DiaryEntity.deleteDiary(diary);
    }

    await ScheduleEntity.deleteSchedule(deleteSchedule);
  }

  //일지 지우기
  async deleteDiaryRelations(diary) {
    if (!diary) {
      return; // 일지가 없으면 삭제할 필요 없음
    }
    // 일지 삭제
    await DiaryEntity.deleteDiary(diary);

    // 연결된 이미지 찾기
    const diaryImg = await DiaryImageEntity.findExistImgUrl(diary);

    // 이미지 삭제
    if (diaryImg) {
      await DiaryImageEntity.deleteDiaryImg(diaryImg);
    }
  }
}
