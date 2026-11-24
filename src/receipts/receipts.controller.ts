import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Headers } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { ReceiptsService } from './receipts.service';

@ApiTags('receipts')
@Controller('sales')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Public()
  @ApiBearerAuth()
  @Get(':id/receipt')
  async json(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('token') token?: string,
  ) {
    await this.receipts.authorize(id, authorization, token);
    const view = await this.receipts.view(id);
    return {
      ...view,
      links: {
        print: `/api/sales/${id}/receipt/print${token ? `?token=${token}` : ''}`,
        pdf: `/api/sales/${id}/receipt.pdf${token ? `?token=${token}` : ''}`,
      },
    };
  }

  @Public()
  @Get(':id/receipt/print')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async print(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('token') token?: string,
    @Query('autoprint') autoprint?: string,
  ) {
    await this.receipts.authorize(id, authorization, token);
    return this.receipts.html(id, autoprint === '1' || autoprint === 'true');
  }

  @Public()
  @Get(':id/receipt.pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('token') token: string | undefined,
    @Res() response: { setHeader: (name: string, value: string) => void; send: (body: Buffer) => void },
  ) {
    await this.receipts.authorize(id, authorization, token);
    const file = await this.receipts.pdf(id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.buffer);
  }
}
