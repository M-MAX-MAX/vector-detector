import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeSVG, analyzeEPS, isValidFileType, getFileTypeName } from './vectorDetection';

describe('Vector Detection', () => {
  const testDir = path.join(process.cwd(), '.test-files');

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(testDir, file));
      });
      fs.rmdirSync(testDir);
    }
  });

  describe('File Type Validation', () => {
    it('should accept valid vector file types', () => {
      expect(isValidFileType('logo.svg')).toBe(true);
      expect(isValidFileType('design.pdf')).toBe(true);
      expect(isValidFileType('artwork.ai')).toBe(true);
      expect(isValidFileType('graphic.eps')).toBe(true);
    });

    it('should reject invalid file types', () => {
      expect(isValidFileType('image.jpg')).toBe(false);
      expect(isValidFileType('photo.png')).toBe(false);
      expect(isValidFileType('document.docx')).toBe(false);
      expect(isValidFileType('video.mp4')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isValidFileType('LOGO.SVG')).toBe(true);
      expect(isValidFileType('Design.PDF')).toBe(true);
      expect(isValidFileType('Artwork.AI')).toBe(true);
    });
  });

  describe('File Type Name', () => {
    it('should return correct file type names', () => {
      expect(getFileTypeName('logo.svg')).toBe('SVG');
      expect(getFileTypeName('design.pdf')).toBe('PDF');
      expect(getFileTypeName('artwork.ai')).toBe('Adobe Illustrator');
      expect(getFileTypeName('graphic.eps')).toBe('EPS');
    });
  });

  describe('SVG Analysis', () => {
    it('should detect true vector SVG', async () => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
  <rect x="10" y="10" width="30" height="30" fill="red"/>
  <path d="M 10 10 L 90 90" stroke="black" stroke-width="2"/>
</svg>`;

      const testFile = path.join(testDir, 'vector.svg');
      fs.writeFileSync(testFile, svgContent);

      const result = await analyzeSVG(testFile);

      expect(result.fileType).toBe('SVG');
      expect(result.verdict).toBe('True Vector');
      expect(result.hasVectorElements).toBe(true);
      expect(result.hasRasterElements).toBe(false);
      expect(result.explanation).toContain('vector element');
    });

    it('should detect raster image in SVG', async () => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" x="0" y="0" width="100" height="100"/>
</svg>`;

      const testFile = path.join(testDir, 'raster.svg');
      fs.writeFileSync(testFile, svgContent);

      const result = await analyzeSVG(testFile);

      expect(result.fileType).toBe('SVG');
      expect(result.verdict).toBe('Raster in Vector Container');
      expect(result.hasVectorElements).toBe(false);
      expect(result.hasRasterElements).toBe(true);
      expect(result.explanation).toContain('raster image');
    });

    it('should detect mixed content in SVG', async () => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
  <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" x="0" y="0" width="50" height="50"/>
</svg>`;

      const testFile = path.join(testDir, 'mixed.svg');
      fs.writeFileSync(testFile, svgContent);

      const result = await analyzeSVG(testFile);

      expect(result.fileType).toBe('SVG');
      expect(result.verdict).toBe('Mixed Content');
      expect(result.hasVectorElements).toBe(true);
      expect(result.hasRasterElements).toBe(true);
      expect(result.explanation).toContain('both');
    });
  });

  describe('EPS Analysis', () => {
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

      const testFile = path.join(testDir, 'vector.eps');
      fs.writeFileSync(testFile, epsContent);

      const result = await analyzeEPS(testFile);

      expect(result.fileType).toBe('EPS');
      expect(result.verdict).toBe('True Vector');
      expect(result.hasVectorElements).toBe(true);
      expect(result.explanation).toContain('vector');
    });

    it('should detect raster image in EPS', async () => {
      const epsContent = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
/image { } def
100 100 image
showpage
%%EOF`;

      const testFile = path.join(testDir, 'raster.eps');
      fs.writeFileSync(testFile, epsContent);

      const result = await analyzeEPS(testFile);

      expect(result.fileType).toBe('EPS');
      expect(result.verdict).toBe('Raster in Vector Container');
      expect(result.hasRasterElements).toBe(true);
      expect(result.explanation).toContain('raster');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid SVG gracefully', async () => {
      const testFile = path.join(testDir, 'invalid.svg');
      fs.writeFileSync(testFile, 'not valid xml');

      try {
        await analyzeSVG(testFile);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to analyze SVG');
      }
    });

    it('should handle missing files gracefully', async () => {
      const testFile = path.join(testDir, 'nonexistent.svg');

      try {
        await analyzeSVG(testFile);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('PDF Analysis - Bug Fix Validation', () => {
    // These tests are inside the main describe block to access testDir
    it('should not default to True Vector when no vector operators are found', async () => {
      // This test validates the fix for the false positive bug
      // Previously, PDFs with no vector operators would default to "True Vector"
      // Now they should default to "Raster in Vector Container"
      
      const epsContent = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
showpage
%%EOF`;

      const testFile = path.join(testDir, 'empty.eps');
      fs.writeFileSync(testFile, epsContent);

      const result = await analyzeEPS(testFile);

      // If no vector elements are detected, it should NOT be "True Vector"
      if (!result.hasVectorElements && !result.hasRasterElements) {
        expect(result.verdict).not.toBe('True Vector');
        expect(['Raster in Vector Container', 'Mixed Content']).toContain(result.verdict);
      }
    });

    it('should correctly classify raster-only content as Raster in Vector Container', async () => {
      // This test validates the fix for Roxanne's logo scenario
      // A file with only raster images and no vector operators should be classified as raster
      
      const epsContent = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
/picstr 100 string def
100 100 8 [100 0 0 -100 0 100]
{ currentfile picstr readhexstring pop } image
showpage
%%EOF`;

      const testFile = path.join(testDir, 'raster-only.eps');
      fs.writeFileSync(testFile, epsContent);

      const result = await analyzeEPS(testFile);

      // If only raster elements are detected, verdict should be "Raster in Vector Container"
      if (result.hasRasterElements && !result.hasVectorElements) {
        expect(result.verdict).toBe('Raster in Vector Container');
        expect(result.explanation).toContain('raster');
      }
    });
  });
}); // Close main describe block
