import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StockLedgerService } from './stock-ledger.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [NotificationsModule],
  controllers: [StockController],
  providers: [StockService, StockLedgerService],
  exports: [StockService],
})
export class StockModule {}
