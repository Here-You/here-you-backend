// journey.entity.ts

import {
  BaseEntity,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  ManyToOne,
  Between,
} from 'typeorm';

import { CreateJourneyDto } from '../dtos/create-journey.dto';
import { ScheduleEntity } from 'src/schedule/schedule.entity';
import { UserEntity } from 'src/user/user.entity';
import { MonthInfoDto } from 'src/map/month-info.dto';
import { ConflictException } from '@nestjs/common';
import { BaseResponse } from 'src/response/response.status';

@Entity()
export class JourneyEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date' })
  endDate: Date;

  @ManyToOne(() => UserEntity, (user) => user.journeys)
  user: UserEntity;

  @OneToMany(() => ScheduleEntity, (schedule) => schedule.journey)
  schedules: ScheduleEntity[];

  @CreateDateColumn()
  created: Date;

  @UpdateDateColumn()
  updated: Date;

  @DeleteDateColumn()
  deleted: Date;

  //여정 생성하기
  static async createJourney(user, createJourneyDto) {
    try {
      const journey: JourneyEntity = new JourneyEntity();
      journey.title = createJourneyDto.title;
      journey.startDate = createJourneyDto.startDate;
      journey.endDate = createJourneyDto.endDate;
      journey.user = user;

      return await journey.save();
    } catch (error) {
      throw new Error(error);
    }
  }

  //여정 삭제하기
  static async deleteJourney(journey) {
    return await JourneyEntity.remove(journey);
  }

  //여정 조회
  static async findExistJourney(journeyId: number) {
    const journey: JourneyEntity = await JourneyEntity.findOne({
      where: {
        id: journeyId,
      },
    });
    return journey;
  }

  static async findExistJourneyByUserId(userId) {
    const journeys: JourneyEntity[] = await JourneyEntity.find({
      where: { user: { id: userId } },
    });

    return journeys;
  }

  static async findExistJourneyByDate(createJourneyDto) {
    const journey: JourneyEntity = await JourneyEntity.findOne({
      where: {
        startDate: createJourneyDto.startDate,
        endDate: createJourneyDto.endDate,
      },
    });
    console.log(journey.startDate);
    return journey;
  }

  //사용자의 월별 여정 조회
  static async findMonthlyJourney(userId, dates: MonthInfoDto) {
    const firstDate = new Date(`${dates.year}-${dates.month}-01`);
    const lastDate = new Date(`${dates.year}-${dates.month}-31`);
    const journeys: JourneyEntity[] = await JourneyEntity.find({
      where: [
        {
          user: { id: userId },
          startDate: Between(firstDate, lastDate),
        },
        {
          user: { id: userId },
          endDate: Between(firstDate, lastDate),
        },
      ],
    });
    return journeys;
  }
}
