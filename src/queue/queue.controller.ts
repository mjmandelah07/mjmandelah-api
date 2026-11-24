import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MANAGERS, Roles } from '../common/roles';
import { QueueService } from './queue.service';

@ApiTags('jobs')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('jobs')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Get()
  recent() {
    return this.queue.recent();
  }
}
