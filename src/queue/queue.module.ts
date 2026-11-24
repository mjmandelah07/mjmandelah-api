import { Module } from '@nestjs/common';
import { ReceiptsModule } from '../receipts/receipts.module';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Module({
  imports: [ReceiptsModule],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
