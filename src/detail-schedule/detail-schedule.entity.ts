import {
  BaseEntity,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { BaseResponse } from 'src/response/response.status';
import { ScheduleEntity } from '../schedule/schedule.entity';
import { DetailContentDto } from './detail-schedule-info.dto';

@Entity()
export class DetailScheduleEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  content: string;

  @Column({ default: false })
  isDone: boolean;

  @ManyToOne(() => ScheduleEntity, (schedule) => schedule.detailSchedules, {
    onDelete: 'CASCADE',
  })
  schedule: ScheduleEntity;

  @CreateDateColumn()
  created: Date;

  @UpdateDateColumn()
  updated: Date;

  @DeleteDateColumn()
  deleted: Date;

  //세부 일정 추가하기
  static async createDetailSchedule(schedule, content: DetailContentDto) {
    const detailSchedule = new DetailScheduleEntity();
    detailSchedule.schedule = schedule;
    detailSchedule.content = content.content;
    return await detailSchedule.save();
  }
  //세부 일정 작성하기
  static async updateDetailSchedule(detailSchedule, content) {
    detailSchedule.content = content;
    return await detailSchedule.save();
  }
  //세부 일정 상태 업데이트하기
  static async updateDetailStatus(detailSchedule) {
    detailSchedule.isDone = !detailSchedule.isDone;
    return await detailSchedule.save();
  }
  //세부 일정 삭제하기
  static async deleteDetailSchedule(detailSchedule) {
    return await DetailScheduleEntity.remove(detailSchedule);
  }

  static async findExistDetail(detailId: number) {
    const detail = await DetailScheduleEntity.findOne({
      where: { id: detailId },
    });
    if (!detail) {
      throw new NotFoundException(BaseResponse.DETAIL_SCHEDULE_NOT_FOUND);
    }
    return detail;
  }

  static async findExistDetailByScheduleId(schedule) {
    const detail = await DetailScheduleEntity.find({
      where: { schedule: { id: schedule.id } },
      select: ['id', 'content', 'isDone'],
    });
    return detail;
  }
}
