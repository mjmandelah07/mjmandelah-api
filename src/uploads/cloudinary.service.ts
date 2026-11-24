import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { UploadedImage } from './uploaded-image';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class CloudinaryService {
  private readonly folder: string;

  constructor(private readonly config: ConfigService) {
    this.folder = this.config.get<string>('CLOUDINARY_FOLDER') || 'mjmandelah';
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get('CLOUDINARY_CLOUD_NAME') &&
        this.config.get('CLOUDINARY_API_KEY') &&
        this.config.get('CLOUDINARY_API_SECRET'),
    );
  }

  async uploadImage(file: UploadedImage, folder: string) {
    this.assertImage(file);
    const result = await this.uploadBuffer(file.buffer, {
      folder: `${this.folder}/${folder}`,
      resource_type: 'image',
    });
    return this.toAsset(result);
  }

  async uploadPdf(buffer: Buffer, publicId: string) {
    this.assertReady();
    const result = await this.uploadBuffer(buffer, {
      folder: `${this.folder}/receipts`,
      public_id: publicId,
      resource_type: 'raw',
      format: 'pdf',
    });
    return this.toAsset(result);
  }

  async destroy(publicId: string, resourceType: 'image' | 'raw' = 'image') {
    if (!this.isConfigured() || !publicId) return;
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }

  private assertReady() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      );
    }
  }

  private assertImage(file: UploadedImage) {
    this.assertReady();
    if (!IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are allowed');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('The image file is empty');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Each image must be 5MB or smaller');
    }
  }

  private uploadBuffer(
    buffer: Buffer,
    options: Record<string, string>,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed'));
          return;
        }
        resolve(result);
      });
      stream.end(buffer);
    });
  }

  private toAsset(result: UploadApiResponse) {
    return {
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      mimeType: result.resource_type === 'image' ? result.format : 'application/pdf',
    };
  }
}
