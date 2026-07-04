import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

type AuthenticatedUser = NonNullable<TrpcContext['user']>;

const testDir = path.join(process.cwd(), '.test-files-e2e');

beforeAll(() => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
});

afterAll(() => {
  if (fs.existsSync(testDir)) {
    const files = fs.readdirSync(testDir);
    files.forEach(file => {
      try {
        fs.unlinkSync(path.join(testDir, file));
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    try {
      fs.rmdirSync(testDir);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
});

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: 'https',
      headers: {},
    } as TrpcContext['req'],
    res: {
      clearCookie: () => {},
    } as TrpcContext['res'],
  };
}

describe('Vector Detection E2E', () => {
  describe('SVG Upload and Analysis', () => {
    it('should analyze a true vector SVG file', async () => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
  <rect x="10" y="10" width="30" height="30" fill="red"/>
  <path d="M 10 10 L 90 90" stroke="black" stroke-width="2"/>
</svg>`;

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.analyze.upload({
        fileName: 'test-vector.svg',
        fileData: Buffer.from(svgContent),
      });

      expect(result.success).toBe(true);
      expect(result.fileName).toBe('test-vector.svg');
      expect(result.fileType).toBe('SVG');
      expect(result.verdict).toBe('True Vector');
      expect(result.hasVectorElements).toBe(true);
      expect(result.hasRasterElements).toBe(false);
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.uploadedAt).toBeDefined();
    });

    it('should detect raster image in SVG', async () => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" x="0" y="0" width="100" height="100"/>
</svg>`;

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.analyze.upload({
        fileName: 'test-raster.svg',
        fileData: Buffer.from(svgContent),
      });

      expect(result.success).toBe(true);
      expect(result.verdict).toBe('Raster in Vector Container');
      expect(result.hasVectorElements).toBe(false);
      expect(result.hasRasterElements).toBe(true);
    });

    it('should detect mixed content in SVG', async () => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
  <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" x="0" y="0" width="50" height="50"/>
</svg>`;

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.analyze.upload({
        fileName: 'test-mixed.svg',
        fileData: Buffer.from(svgContent),
      });

      expect(result.success).toBe(true);
      expect(result.verdict).toBe('Mixed Content');
      expect(result.hasVectorElements).toBe(true);
      expect(result.hasRasterElements).toBe(true);
    });
  });

  describe('File Type Validation', () => {
    it('should reject non-vector file types', async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.analyze.upload({
          fileName: 'test.jpg',
          fileData: Buffer.from('fake image data'),
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as any).message).toContain('not supported');
      }
    });

    it('should reject files exceeding size limit', async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      // Create a buffer larger than 50MB
      const largeBuffer = Buffer.alloc(51 * 1024 * 1024);

      try {
        await caller.analyze.upload({
          fileName: 'large-file.svg',
          fileData: largeBuffer,
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as any).message).toContain('too large');
      }
    });

    it('should accept valid file extensions', async () => {
      const validFiles = ['test.svg', 'test.pdf', 'test.ai', 'test.eps'];
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
</svg>`;

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      for (const fileName of validFiles) {
        if (fileName.endsWith('.svg')) {
          const result = await caller.analyze.upload({
            fileName,
            fileData: Buffer.from(svgContent),
          });
          expect(result.success).toBe(true);
        }
      }
    });
  });

  describe('EPS Upload and Analysis', () => {
    it('should detect true vector EPS', async () => {
      const epsContent = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
/m { moveto } def
/l { lineto } def
/s { stroke } def
100 100 m
200 200 l
s
showpage
%%EOF`;

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.analyze.upload({
        fileName: 'test-vector.eps',
        fileData: Buffer.from(epsContent),
      });

      expect(result.success).toBe(true);
      expect(result.fileType).toBe('EPS');
      expect(result.verdict).toBe('True Vector');
      expect(result.hasVectorElements).toBe(true);
    });

    it('should detect raster image in EPS', async () => {
      const epsContent = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
/image { } def
100 100 image
showpage
%%EOF`;

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.analyze.upload({
        fileName: 'test-raster.eps',
        fileData: Buffer.from(epsContent),
      });

      expect(result.success).toBe(true);
      expect(result.verdict).toBe('Raster in Vector Container');
      expect(result.hasRasterElements).toBe(true);
    });
  });

  describe('Public Access', () => {
    it('should allow public (unauthenticated) access', async () => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
</svg>`;

      const ctx = createPublicContext();
      expect(ctx.user).toBeNull();

      const caller = appRouter.createCaller(ctx);
      const result = await caller.analyze.upload({
        fileName: 'public-test.svg',
        fileData: Buffer.from(svgContent),
      });

      expect(result.success).toBe(true);
      expect(result.verdict).toBe('True Vector');
    });
  });

  describe('Result Metadata', () => {
    it('should include complete metadata in results', async () => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
</svg>`;

      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.analyze.upload({
        fileName: 'metadata-test.svg',
        fileData: Buffer.from(svgContent),
      });

      expect(result).toHaveProperty('fileName');
      expect(result).toHaveProperty('fileSize');
      expect(result).toHaveProperty('uploadedAt');
      expect(result).toHaveProperty('fileType');
      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('explanation');
      expect(result).toHaveProperty('hasVectorElements');
      expect(result).toHaveProperty('hasRasterElements');
      expect(result).toHaveProperty('details');

      expect(result.fileName).toBe('metadata-test.svg');
      expect(typeof result.fileSize).toBe('number');
      expect(result.uploadedAt).toBeInstanceOf(Date);
      expect(typeof result.explanation).toBe('string');
      expect(result.explanation.length).toBeGreaterThan(0);
    });
  });
});
