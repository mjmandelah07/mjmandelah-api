import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PageQueryDto } from '../common/page';
import { NotificationsService } from './notifications.service';

class NotificationQuery extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query() query: NotificationQuery) {
    return this.notifications.list(query);
  }

  @Patch('read-all')
  readAll() {
    return this.notifications.markAllRead();
  }

  @Patch(':id/read')
  read(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(id);
  }
}
