export type UploadedImage = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
};

export function asUploaded(file: Express.Multer.File): UploadedImage {
  return {
    buffer: file.buffer,
    mimetype: file.mimetype,
    size: file.size,
    originalname: file.originalname,
  };
}
