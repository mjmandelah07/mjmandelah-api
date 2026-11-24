import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { asUploaded } from '../uploads/uploaded-image';
import { DamagesService } from './damages.service';
import { CreateDamageDto } from './dto/create-damage.dto';

@ApiTags('damages')
@ApiBearerAuth()
@Controller('damages')
export class DamagesController {
  constructor(private readonly damages: DamagesService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 6 }], {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateDamageDto,
    @UploadedFiles() files?: { images?: Express.Multer.File[] },
  ) {
    return this.damages.create(actor, dto, (files?.images ?? []).map(asUploaded));
  }

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.damages.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.damages.get(id);
  }
}
