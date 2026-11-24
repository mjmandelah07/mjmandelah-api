import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptArchiveService } from '../receipts/receipt-archive.service';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private databaseDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly archive: ReceiptArchiveService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, 5000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueue(type: string, payload: Prisma.InputJsonValue) {
    try {
      await this.prisma.job.create({ data: { type, payload } });
    } catch (error) {
      this.logger.error(`Could not queue ${type}`, error instanceof Error ? error.message : error);
    }
  }

  async recent() {
    return this.prisma.job.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.prisma.job.findMany({
        where: { status: JobStatus.PENDING, runAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });
      this.databaseDown = false;
      for (const job of jobs) {
        const claimed = await this.prisma.job.updateMany({
          where: { id: job.id, status: JobStatus.PENDING },
          data: { status: JobStatus.PROCESSING },
        });
        if (!claimed.count) continue;
        await this.run(job.id, job.type, job.payload, job.attempts);
      }
    } catch (error) {
      if (!this.databaseDown) {
        this.logger.error(
          'Queue is waiting for the database',
          error instanceof Error ? error.message : error,
        );
        this.databaseDown = true;
      }
    } finally {
      this.running = false;
    }
  }

  private async run(id: string, type: string, payload: Prisma.JsonValue, attempts: number) {
    try {
      if (type === 'receipt.archive') {
        const saleId = this.readSaleId(payload);
        const result = await this.archive.archive(saleId);
        if (result === 'skipped') {
          await this.prisma.job.update({
            where: { id },
            data: {
              status: JobStatus.FAILED,
              attempts: 5,
              lastError: 'Cloudinary is not configured, so the PDF was not archived',
            },
          });
          return;
        }
      }
      await this.prisma.job.update({
        where: { id },
        data: { status: JobStatus.DONE, lastError: null },
      });
    } catch (error) {
      const nextAttempts = attempts + 1;
      const message = error instanceof Error ? error.message : 'Job failed';
      await this.prisma.job.update({
        where: { id },
        data: {
          status: nextAttempts >= 5 ? JobStatus.FAILED : JobStatus.PENDING,
          attempts: nextAttempts,
          lastError: message,
          runAt: new Date(Date.now() + nextAttempts * 30_000),
        },
      });
    }
  }

  private readSaleId(payload: Prisma.JsonValue) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'saleId' in payload) {
      const saleId = payload.saleId;
      if (typeof saleId === 'string') return saleId;
    }
    throw new Error('Job payload is missing saleId');
  }
}
