import { Injectable } from '@nestjs/common';
import { ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { ReceiptsService } from './receipts.service';
import { renderReceiptPdf } from './receipt-pdf';

@Injectable()
export class ReceiptArchiveService {
  constructor(
    private readonly receipts: ReceiptsService,
    private readonly cloudinary: CloudinaryService,
    private readonly prisma: PrismaService,
  ) {}

  async archive(saleId: string): Promise<'ready' | 'skipped'> {
    if (!this.cloudinary.isConfigured()) {
      await this.prisma.sale.update({
        where: { id: saleId },
        data: { receiptStatus: ReceiptStatus.FAILED },
      });
      return 'skipped';
    }
    const view = await this.receipts.view(saleId);
    const pdf = await renderReceiptPdf(view);
    const uploaded = await this.cloudinary.uploadPdf(pdf, view.receiptNumber);
    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        receiptPdfUrl: uploaded.url,
        receiptPdfPublicId: uploaded.publicId,
        receiptStatus: ReceiptStatus.READY,
      },
    });
    return 'ready';
  }
}
