import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MANAGERS, Roles } from '../common/roles';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { SupplierQuery, SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Get()
  list(@Query() query: SupplierQuery) {
    return this.suppliers.list(query);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(id, dto);
  }
}
