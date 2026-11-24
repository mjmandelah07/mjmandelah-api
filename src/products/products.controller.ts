import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser } from '../common/auth-user';
import { MANAGERS, Roles } from '../common/roles';
import { asUploaded } from '../uploads/uploaded-image';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductsService } from './products.service';

const imageInterceptor = FileFieldsInterceptor(
  [
    { name: 'images', maxCount: 6 },
    { name: 'receipt', maxCount: 1 },
  ],
  { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
);

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Roles(...MANAGERS)
  @Post()
  @ApiConsumes('application/json', 'multipart/form-data')
  @UseInterceptors(imageInterceptor)
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateProductDto,
    @UploadedFiles() files?: { images?: Express.Multer.File[]; receipt?: Express.Multer.File[] },
  ) {
    return this.products.create(
      actor,
      dto,
      (files?.images ?? []).map(asUploaded),
      files?.receipt?.[0] ? asUploaded(files.receipt[0]) : undefined,
    );
  }

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: ProductQueryDto) {
    return this.products.list(actor.role, query);
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(actor.role, id);
  }

  @Roles(...MANAGERS)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(actor.role, id, dto);
  }

  @Roles(...MANAGERS)
  @Post(':id/images')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(imageInterceptor)
  addImages(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files?: { images?: Express.Multer.File[] },
  ) {
    return this.products.addImages(actor.role, id, (files?.images ?? []).map(asUploaded));
  }

  @Roles(...MANAGERS)
  @Delete(':id/images/:fileId')
  removeImage(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.products.removeImage(actor.role, id, fileId);
  }

  @Roles(...MANAGERS)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }
}
