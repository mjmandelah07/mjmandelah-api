import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth-user';
import { MANAGERS, Roles } from '../common/roles';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateSaleDto) {
    return this.sales.create(actor, dto);
  }

  @Get()
  list(@Query() query: SaleQueryDto) {
    return this.sales.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.get(id);
  }

  @Roles(...MANAGERS)
  @Post(':id/void')
  voidSale(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.voidSale(actor, id);
  }
}
