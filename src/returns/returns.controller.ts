import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth-user';
import { PageQueryDto } from '../common/page';
import { CreateReturnDto } from './dto/create-return.dto';
import { ReturnsService } from './returns.service';

@ApiTags('returns')
@ApiBearerAuth()
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateReturnDto) {
    return this.returns.create(actor, dto);
  }

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.returns.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.returns.get(id);
  }
}
