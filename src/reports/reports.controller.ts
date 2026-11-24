import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth-user';
import { MANAGERS, Roles } from '../common/roles';
import { ReportQueryDto, ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles(...MANAGERS)
  @Get('overview')
  overview(@Query() query: ReportQueryDto) {
    return this.reports.overview(query);
  }

  @Get('me')
  mine(@CurrentUser() actor: AuthUser) {
    return this.reports.mine(actor);
  }
}
