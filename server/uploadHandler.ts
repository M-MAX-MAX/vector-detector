import { IncomingForm } from 'formidable';
import * as fs from 'fs';
import * as path from 'path';
import { Request } from 'express';

export interface UploadedFile {
  fileName: string;
  fileData: Buffer;
  mimeType: string;
}

/**
 * Handles multipart/form-data file uploads
 * Parses the request and extracts file data
 */
export async function handleFileUpload(req: Request): Promise<UploadedFile | null> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxFiles: 1,
      keepExtensions: true,
    });

    form.parse(req, async (err: any, fields: any, files: any) => {
      if (err) {
        reject(new Error(`Upload failed: ${err.message}`));
        return;
      }

      try {
        const fileArray = files.file;
        if (!fileArray) {
          resolve(null);
          return;
        }

        const file = Array.isArray(fileArray) ? fileArray[0] : fileArray;
        if (!file) {
          resolve(null);
          return;
        }

        const fileData = await fs.promises.readFile(file.filepath);
        const fileName = file.originalFilename || 'file';
        const mimeType = file.mimetype || 'application/octet-stream';

        // Clean up temporary file created by formidable
        try {
          await fs.promises.unlink(file.filepath);
        } catch (e) {
          console.warn('Failed to clean up temp file:', e);
        }

        resolve({
          fileName,
          fileData,
          mimeType,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Validates MIME type for vector files
 */
export function isValidMimeType(mimeType: string): boolean {
  const validTypes = [
    'image/svg+xml',
    'application/pdf',
    'application/postscript',
    'application/eps',
    'application/x-eps',
    'image/eps',
    'application/illustrator',
    'application/x-illustrator',
    'image/vnd.adobe.illustrator',
  ];

  return validTypes.includes(mimeType.toLowerCase());
}

/**
 * Gets the file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string | null {
  const mimeToExt: Record<string, string> = {
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'application/postscript': '.eps',
    'application/eps': '.eps',
    'application/x-eps': '.eps',
    'image/eps': '.eps',
    'application/illustrator': '.ai',
    'application/x-illustrator': '.ai',
    'image/vnd.adobe.illustrator': '.ai',
  };

  return mimeToExt[mimeType.toLowerCase()] || null;
}
