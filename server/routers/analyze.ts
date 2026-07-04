import { TRPCError } from '@trpc/server';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { publicProcedure, router } from '../_core/trpc';
import { analyzeFile, isValidFileType, getFileTypeName, DetectionResult } from '../vectorDetection';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const analyzeRouter = router({
  upload: publicProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileData: z.instanceof(Uint8Array),
      })
    )
    .mutation(async ({ input }) => {
      // Validate file type
      if (!isValidFileType(input.fileName)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `File type not supported. Please upload SVG, PDF, AI, or EPS files only.`,
        });
      }

      // Validate file size
      if (input.fileData.byteLength > MAX_FILE_SIZE) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `File is too large. Maximum file size is 50MB.`,
        });
      }

      // Create temporary file
      const tempDir = path.join(process.cwd(), '.temp-uploads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${input.fileName}`;
      const tempFilePath = path.join(tempDir, tempFileName);

      try {
        // Write file to temporary location
        fs.writeFileSync(tempFilePath, Buffer.from(input.fileData));

        // Analyze the file
        const result = await analyzeFile(tempFilePath, input.fileName);

        return {
          success: true,
          fileName: input.fileName,
          fileSize: input.fileData.byteLength,
          uploadedAt: new Date(),
          ...result,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to analyze file: ${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        // Clean up temporary file
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (e) {
          console.error('Failed to clean up temporary file:', e);
        }
      }
    }),
});
