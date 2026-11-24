import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReceiptArchiveService } from './receipt-archive.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [AuthModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptArchiveService],
  exports: [ReceiptsService, ReceiptArchiveService],
})
export class ReceiptsModule {}
