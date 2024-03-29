import { Injectable, NotFoundException } from '@nestjs/common';
import { JourneyEntity } from '../journey/model/journey.entity';
import { errResponse, response } from 'src/response/response';
import { BaseResponse } from 'src/response/response.status';
import { UserEntity } from 'src/user/user.entity';
import { DiaryEntity } from 'src/diary/models/diary.entity';
import { ScheduleEntity } from 'src/schedule/schedule.entity';
import { MonthInfoDto } from './month-info.dto';
import { DiaryImageEntity } from 'src/diary/models/diary.image.entity';
import { DetailScheduleEntity } from 'src/detail-schedule/detail-schedule.entity';
import { CursorBasedPaginationRequestDto } from './cursor-based-pagination-request.dto.ts';
import { S3UtilService } from 'src/utils/S3.service';

@Injectable()
export class MapService {
  constructor(private readonly s3UtilService: S3UtilService) {}

  /*캘린더에서 사용자의 월별 일정 불러오기*/
  async getMonthlySchedules(
    userId: number,
    date: Date,
    options: CursorBasedPaginationRequestDto,
  ) {
    const user = await UserEntity.findExistUser(userId);
    const journey = await JourneyEntity.findExistJourneyByDate(user.id, date);
    if (!journey) {
      return errResponse(BaseResponse.JOURNEY_NOT_FOUND);
    }
    const schedules = await ScheduleEntity.findExistSchedulesByJourneyId(
      journey.id,
    );
    if (!schedules) {
      return errResponse(BaseResponse.SCHEDULE_NOT_FOUND);
    }
    const journeyInfo = {
      userId: user.id,
      journeyId: journey.id,
      startDate: journey.startDate,
      endDate: journey.endDate,
    };

    const scheduleList = await Promise.all(
      schedules.map(async (schedule) => {
        const locations = await this.getLocationList([schedule]); // getLocationList에 schedule 배열을 전달
        const detailSchedules = await this.getDetailScheduleList([schedule]); // getDetailScheduleList에 schedule 배열을 전달
        const diary = await this.getDiaryStatus([schedule]); // getDiaryStatus에 schedule 배열을 전달

        return {
          scheduleId: schedule.id,
          title: schedule.title,
          date: schedule.date,
          location: locations,
          detailSchedules: detailSchedules,
          diary: diary,
        };
      }),
    );
    //    return {
    //    userId: user.id,
    //    journeyId: journey.id,
    //    startDate: journey.startDate,
    //    endDate: journey.endDate,
    //    scheduleList: scheduleList,
    //  };

    // 페이징 처리
    const startIndex = options.cursor;
    const endIndex = Number(options.cursor) + Number(options.pageSize);
    const paginatedSchedules = scheduleList.slice(startIndex, endIndex);

    // 다음 페이지를 위한 커서 값 계산
    let nextCursor = null;
    if (endIndex < scheduleList.length) {
      nextCursor = endIndex;
    }
    const total = scheduleList.length;
    const hasNextData = endIndex < total;
    const meta = {
      take: options.pageSize,
      total: total,
      hasNextData: hasNextData,
      cursor: nextCursor,
    };

    // 다음 페이지를 위한 커서 값 계산
    // const nextCursor = Number(options.cursor) + Number(options.pageSize);

    return {
      data: response(BaseResponse.GET_SCHEDULE_SUCCESS, {
        journeyInfo,
        paginatedSchedules,
        meta,
      }),
    };
  }

  /*지도에서 사용자의 월별 여정 불러오기*/
  async getMonthlyJourneyMap(userId: number, monthInfoDto: MonthInfoDto) {
    const user = await UserEntity.findExistUser(userId);
    const monthlyJourney = await this.getMonthlyJourney(user.id, monthInfoDto);
    if (monthlyJourney.length === 0) {
      return errResponse(BaseResponse.JOURNEY_NOT_FOUND);
    }

    const journeyList = await Promise.all(
      monthlyJourney.map(async (journey) => {
        const schedules = await this.getMonthlySchedule(
          journey.id,
          monthInfoDto,
        );
        console.log(schedules);
        const locations = await this.getLocationList(schedules);
        const images = await this.getDiaryImageList(schedules);
        const mapInfo = schedules.map((schedule, index) => {
          return {
            date: schedules[index].date,
            location: locations[index],
            diaryImage: images[index],
          };
        });
        const diaryCount = await this.getDiaryCount(schedules);
        return {
          userId: user.id,
          journeyId: journey.id,
          title: journey.title,
          startDate: journey.startDate,
          endDate: journey.endDate,
          map: mapInfo,
          diaryCount: diaryCount,
        };
      }),
    );
    return response(BaseResponse.GET_MONTHLY_JOURNEY_SUCCESS, journeyList);
  }

  /*지도에서 여정 정보 보여주기*/
  async getJourneyPreview(userId, journeyId) {
    const user = await UserEntity.findExistUser(userId);
    const journey = await this.getJourneyInfo(journeyId);
    const schedules = await ScheduleEntity.findExistSchedulesByJourneyId(
      journeyId,
    );
    const locationList = await this.getLocationList(schedules);
    const imageList = await this.getDiaryImageList(schedules);
    const scheduleList = schedules.map((schedule, index) => {
      return {
        location: locationList[index],
        diaryImage: imageList[index],
      };
    });

    return response(BaseResponse.GET_JOURNEY_PREVIEW_SUCCESS, {
      userId: user.id,
      journey: {
        journeyId: journey.id,
        title: journey.title,
        startDate: journey.startDate,
        endDate: journey.endDate,
      },
      scheduleList,
    });
  }

  /*작성한 일지 불러오기 - 지도*/
  async getDiaryList(userId, journeyId) {
    const user = await UserEntity.findExistUser(userId);
    const journey = await JourneyEntity.findExistJourney(journeyId);
    const schedules = await ScheduleEntity.findExistSchedulesByJourneyId(
      journey.id,
    );
    const diaryList = await Promise.all(
      schedules.map(async (schedule) => {
        const diary = await DiaryEntity.findExistDiaryByScheduleId(schedule);
        if (!diary) {
          return null;
        }
        const diaryImg = await DiaryImageEntity.findExistImgUrl(diary);
        const imageUrl = await this.s3UtilService.getImageUrl(
          diaryImg.imageUrl,
        );
        if (!diaryImg) {
          return null;
        }
        return {
          journeyId: journeyId,
          scheduleId: schedule.id,
          date: schedule.date,
          diary: diary,
          diaryImage: {
            id: diaryImg.id,
            imageUrl: imageUrl,
          },
        };
      }),
    );
    return response(BaseResponse.GET_DIARY_SUCCESS, {
      userId: user.id,
      diaryList,
    });
  }

  /* 지도에서 세부 여정 확인하기 */
  async getDetailJourneyList(userId, journeyId) {
    const user = await UserEntity.findExistUser(userId);
    const journey = await this.getJourneyInfo(journeyId);
    const schedules = await ScheduleEntity.findExistSchedulesByJourneyId(
      journey.id,
    );
    const scheduleInfoList = await this.getScheduleList(schedules);
    const locationList = await this.getLocationList(schedules);
    const imageList = await this.getDiaryImageList(schedules);
    const diaryStatus = await this.getDiaryStatus(schedules);
    const detailJourneyList = schedules.map((schedule, index) => {
      return {
        schedule: scheduleInfoList[index],
        location: locationList[index],
        diaryImage: imageList[index],
        diary: diaryStatus[index],
      };
    });
    return response(BaseResponse.GET_SCHEDULE_SUCCESS, {
      userId: user.id,
      detailJourneyList,
    });
  }

  //일정 정보 불러오기
  async getScheduleList(schedules: ScheduleEntity[]) {
    const scheduleInfoList = await Promise.all(
      schedules.map(async (schedule) => {
        const scheduleInfo = await ScheduleEntity.findExistSchedule(
          schedule.id,
        );
        return {
          scheduleId: scheduleInfo.id,
          title: scheduleInfo.title,
          date: scheduleInfo.date,
        };
      }),
    );
    return scheduleInfoList;
  }

  //위치 정보 불러오기
  async getLocationList(schedules: ScheduleEntity[]) {
    const locationList = await Promise.all(
      schedules.map(async (schedule) => {
        const location = await ScheduleEntity.findExistLocation(schedule.id);
        console.log(location);
        if (!location) {
          return { location: null };
        }
        return {
          locationId: location.id,
          name: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
        };
      }),
    );
    return locationList;
  }

  //이미지 리스트 불러오기
  async getDiaryImageList(schedules: ScheduleEntity[]) {
    const diaryImageList = await Promise.all(
      schedules.map(async (schedule) => {
        const diary = await DiaryEntity.findExistDiaryByScheduleId(schedule);
        if (!diary) {
          return null;
        }
        const diaryImage = await DiaryImageEntity.findExistImgUrl(diary);
        const imageUrl = await this.s3UtilService.getImageUrl(
          diaryImage.imageUrl,
        );
        return {
          imageId: diaryImage.id,
          imageUrl: imageUrl,
        };
      }),
    );
    return diaryImageList;
  }

  //사용자의 월별 여정 가지고 오기
  async getMonthlyJourney(userId, monthInfoDto: MonthInfoDto) {
    const journeys = await JourneyEntity.findMonthlyJourney(
      userId,
      monthInfoDto,
    );
    return journeys;
  }

  //사용자의 월별 일정 가지고 오기
  async getMonthlySchedule(
    journeyId,
    monthInfoDto: MonthInfoDto,
  ): Promise<ScheduleEntity[]> {
    const schedules: ScheduleEntity[] =
      await ScheduleEntity.findMonthlySchedule(journeyId, monthInfoDto);
    return schedules;
  }

  // 사용자의 세부 일정 가지고 오기
  async getDetailScheduleList(schedules: ScheduleEntity[]) {
    const detailScheduleList = await Promise.all(
      schedules.map(async (schedule) => {
        const detailSchedules =
          await DetailScheduleEntity.findExistDetailByScheduleId(schedule);
        return detailSchedules;
      }),
    );
    return detailScheduleList;
  }

  //여정에 작성한 일지 개수 가지고 오기
  async getDiaryCount(schedules) {
    let diaryCount = 0;
    for (const schedule of schedules) {
      const diary = await DiaryEntity.findExistDiaryByScheduleId(schedule);
      if (diary) {
        diaryCount += 1;
      }
    }
    return diaryCount;
  }

  //일지 작성 여부 가져오기
  async getDiaryStatus(schedules) {
    const diaryStatusList = await Promise.all(
      schedules.map(async (schedule) => {
        const diary = await DiaryEntity.findExistDiaryByScheduleId(schedule);
        if (!diary) {
          return false;
        }
        return true;
      }),
    );

    return diaryStatusList;
  }

  //여정 정보 불러오기
  async getJourneyInfo(journeyId) {
    const journey = await JourneyEntity.findExistJourney(journeyId);
    if (!journey) {
      throw new NotFoundException(BaseResponse.JOURNEY_NOT_FOUND);
    }
    return {
      id: journey.id,
      title: journey.title,
      startDate: journey.startDate,
      endDate: journey.endDate,
    };
  }
}

// const scheduleList = await Promise.all(
//   journeys.map(async (journey) => {
//     const schedules = await ScheduleEntity.findExistScheduleByJourneyId(
//       journey.id,
//     );
//     if (!schedules) {
//       return errResponse(BaseResponse.SCHEDULE_NOT_FOUND);
//     }
//     const locations = await this.getLocationList(schedules);
//     const detailSchedules = await this.getDetailScheduleList(schedules);
//     const diary = await this.getDiaryStatus(schedules);
//   }),
// );
