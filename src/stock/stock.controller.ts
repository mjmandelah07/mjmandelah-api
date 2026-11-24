import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser } from '../common/auth-user';
import { PageQueryDto } from '../common/page';
import { MANAGERS, Roles } from '../common/roles';
import { asUploaded } from '../uploads/uploaded-image';
import { AdjustStockDto, CreateIntakeDto } from './dto/stock.dto';
import { MovementQuery, StockLedgerService } from './stock-ledger.service';

@ApiTags('stock')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('stock')
export class StockController {
  constructor(private readonly ledger: StockLedgerService) {}

  @Post('intakes')
  @ApiConsumes('application/json', 'multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'receipt', maxCount: 1 }], {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  intake(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateIntakeDto,
    @UploadedFiles() files?: { receipt?: Express.Multer.File[] },
  ) {
    const receipt = files?.receipt?.[0];
    return this.ledger.intake(actor, dto, receipt ? asUploaded(receipt) : undefined);
  }

  @Get('intakes')
  intakes(@Query() query: PageQueryDto) {
    return this.ledger.listIntakes(query);
  }

  @Get('movements')
  movements(@Query() query: MovementQuery) {
    return this.ledger.movements(query);
  }

  @Post('adjustments')
  adjust(@CurrentUser() actor: AuthUser, @Body() dto: AdjustStockDto) {
    return this.ledger.adjust(actor, dto);
  }
}
