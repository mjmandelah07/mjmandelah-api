import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { DamagesController } from './damages.controller';
import { DamagesService } from './damages.service';

@Module({
  imports: [StockModule],
  controllers: [DamagesController],
  providers: [DamagesService],
})
export class DamagesModule {}
