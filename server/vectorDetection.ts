import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';

let pdfParse: any = null;

// Lazy load pdf-parse since it's a CommonJS module
async function getPdfParse() {
  if (!pdfParse) {
    const mod = await import('pdf-parse');
    // pdf-parse exports PDFParse as a named export
    pdfParse = (mod as any).PDFParse || (mod as any).default || mod;
  }
  return pdfParse;
}

export interface DetectionResult {
  fileType: string;
  verdict: 'True Vector' | 'Raster in Vector Container' | 'Mixed Content';
  explanation: string;
  hasVectorElements: boolean;
  hasRasterElements: boolean;
  details: Record<string, unknown>;
}

/**
 * Analyzes an SVG file to determine if it contains true vector elements or only raster images
 */
export async function analyzeSVG(filePath: string): Promise<DetectionResult> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(content);

    const svgRoot = result.svg;
    if (!svgRoot) {
      return {
        fileType: 'SVG',
        verdict: 'Raster in Vector Container',
        explanation: 'SVG file structure is invalid or empty.',
        hasVectorElements: false,
        hasRasterElements: false,
        details: { error: 'Invalid SVG structure' },
      };
    }

    // Count vector and raster elements
    let vectorCount = 0;
    let rasterCount = 0;

    const vectorTags = ['path', 'rect', 'circle', 'polygon', 'line', 'polyline', 'ellipse', 'text', 'g'];

    const countElements = (obj: any): void => {
      if (!obj) return;

      for (const tag of vectorTags) {
        if (obj[tag]) {
          const items = Array.isArray(obj[tag]) ? obj[tag] : [obj[tag]];
          vectorCount += items.length;
        }
      }

      if (obj.image) {
        const items = Array.isArray(obj.image) ? obj.image : [obj.image];
        rasterCount += items.length;
      }

      // Recursively check groups
      if (obj.g) {
        const groups = Array.isArray(obj.g) ? obj.g : [obj.g];
        for (const group of groups) {
          countElements(group);
        }
      }
    };

    countElements(svgRoot);

    const hasVectorElements = vectorCount > 0;
    const hasRasterElements = rasterCount > 0;

    let verdict: 'True Vector' | 'Raster in Vector Container' | 'Mixed Content';
    let explanation: string;

    if (hasVectorElements && !hasRasterElements) {
      verdict = 'True Vector';
      explanation = `This SVG contains ${vectorCount} vector element(s) (paths, shapes, text) and no embedded raster images. It is a true vector graphic that will scale perfectly at any size.`;
    } else if (hasRasterElements && !hasVectorElements) {
      verdict = 'Raster in Vector Container';
      explanation = `This SVG contains ${rasterCount} embedded raster image(s) but no vector drawing elements. It is a raster image wrapped in SVG format. Scaling will result in pixelation.`;
    } else if (hasVectorElements && hasRasterElements) {
      verdict = 'Mixed Content';
      explanation = `This SVG contains both ${vectorCount} vector element(s) and ${rasterCount} embedded raster image(s). It is a hybrid file with both vector and raster content.`;
    } else {
      verdict = 'Raster in Vector Container';
      explanation = 'This SVG appears to be empty or contains no recognizable vector or raster elements.';
    }

    return {
      fileType: 'SVG',
      verdict,
      explanation,
      hasVectorElements,
      hasRasterElements,
      details: {
        vectorElementCount: vectorCount,
        rasterImageCount: rasterCount,
      },
    };
  } catch (error) {
    throw new Error(`Failed to analyze SVG: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Analyzes a PDF file to determine if it contains vector graphics or only raster images
 */
export async function analyzePDF(filePath: string): Promise<DetectionResult> {
  try {
    // First, try to detect raster images using pdfimages utility
    let rasterImageCount = 0;
    try {
      const output = execSync(`pdfimages -list "${filePath}" 2>/dev/null`, { encoding: 'utf-8' });
      // Count non-header lines (each image is a line)
      const lines = output.split('\n').filter(line => line.trim() && !line.includes('page'));
      rasterImageCount = Math.max(0, lines.length - 1); // Subtract header
    } catch (e) {
      // pdfimages might fail, continue with PDF parsing
    }

    // Parse PDF to check for vector content
    const pdfBuffer = fs.readFileSync(filePath);
    let pdfData: any = { numpages: 0 };
    
    try {
      const PDFParseClass = await getPdfParse();
      // PDFParse requires options with verbosity level and url parameter
      const pdfParser = new PDFParseClass({ verbosity: 0, url: filePath });
      pdfData = await pdfParser.load(pdfBuffer);
    } catch (parseError) {
      // PDF parsing failed, but we can still analyze the binary content
      console.warn('[PDF] PDFParse failed, continuing with binary analysis:', parseError);
    }

    // Check PDF for embedded images using structural markers (most reliable method)
    const pdfText = pdfBuffer.toString('binary');
    
    // RELIABLE: Look for PDF structural markers that definitively indicate embedded raster images
    // /Type /XObject combined with /Subtype /Image means embedded raster image
    const hasEmbeddedImageMarkers = /\/Type\s*\/XObject/.test(pdfText) && /\/Subtype\s*\/Image/.test(pdfText);
    
    // Also check for image encoding filters (DCTDecode = JPEG, JPXDecode = JPEG2000)
    const hasImageFilters = /\/DCTDecode|\/JPXDecode/.test(pdfText);
    
    // Check for actual vector drawing operators
    // Look for path construction patterns: numbers followed by moveto/lineto/curveto
    const hasPathDrawing = /\d+\.?\d*\s+\d+\.?\d*\s+(m|l|c|v|y|h)\s/.test(pdfText);
    
    // Check for stroke/fill operations that come after path construction
    // Only match if there's an actual path command (m/l/c) before the stroke/fill
    // This avoids false positives from metadata like "00000 n"
    const hasStrokeOrFill = /\d+\.?\d*\s+\d+\.?\d*\s+m\s[\s\S]{0,500}(S|f|B)\s/.test(pdfText);
    
    const hasVectorElements = hasPathDrawing || hasStrokeOrFill;

    let verdict: 'True Vector' | 'Raster in Vector Container' | 'Mixed Content';
    let explanation: string;

    // Priority: If we found embedded image markers or image filters, it's definitely raster
    if (hasEmbeddedImageMarkers || hasImageFilters) {
      if (hasVectorElements) {
        verdict = 'Mixed Content';
        explanation = 'This PDF contains embedded raster image(s) and vector drawing operators. It is a hybrid file with both vector and raster content.';
      } else {
        verdict = 'Raster in Vector Container';
        explanation = 'This PDF contains embedded raster image(s) but no vector drawing operators. It is a raster image wrapped in PDF format. Scaling will result in pixelation.';
      }
    } else if (hasVectorElements && rasterImageCount === 0) {
      verdict = 'True Vector';
      explanation = 'This PDF contains vector drawing operators and no embedded raster images. It is a true vector graphic that will scale perfectly at any size.';
    } else if (hasVectorElements && rasterImageCount > 0) {
      verdict = 'Mixed Content';
      explanation = `This PDF contains both vector drawing operators and ${rasterImageCount} embedded raster image(s). It is a hybrid file with both vector and raster content.`;
    } else if (rasterImageCount > 0) {
      verdict = 'Raster in Vector Container';
      explanation = `This PDF contains ${rasterImageCount} embedded raster image(s) but no vector drawing operators. It is a raster image wrapped in PDF format. Scaling will result in pixelation.`;
    } else {
      // No clear indicators - default to raster container
      verdict = 'Raster in Vector Container';
      explanation = 'This PDF does not contain recognizable vector drawing operators. It appears to be a raster image or simple graphic wrapped in PDF format.';
    }

    return {
      fileType: 'PDF',
      verdict,
      explanation,
      hasVectorElements,
      hasRasterElements: rasterImageCount > 0,
      details: {
        rasterImageCount,
        pages: pdfData.numpages,
      },
    };
  } catch (error) {
    throw new Error(`Failed to analyze PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Analyzes an EPS file to determine if it contains vector graphics or only raster images
 */
export async function analyzeEPS(filePath: string): Promise<DetectionResult> {
  try {
    const content = fs.readFileSync(filePath, 'binary');
    const contentStr = content.toString();

    // Look for PostScript vector drawing operators
    const vectorOperators = [
      /\sm\s/,        // moveto
      /\sl\s/,        // lineto
      /\sc\s/,        // curveto
      /\sv\s/,        // curveto variant
      /\sy\s/,        // curveto variant
      /\sh\s/,        // closepath
      /\sS\s/,        // stroke
      /\sf\s/,        // fill
      /\sB\s/,        // fill and stroke
      /\sre\s/,       // rectangle
      /\srg\s/,       // setrgbcolor
      /\sRG\s/,       // setrgbcolor (stroke)
      /stroke/,
      /fill/,
      /moveto/,
      /lineto/,
      /curveto/,
    ];

    // Look for raster image operators
    const rasterOperators = [
      /\simage\s/,
      /\simagemask\s/,
      /\scolorimag/,
      /colorimage/,
      /image\s*{/,
    ];

    let hasVectorOperators = false;
    let hasRasterOperators = false;

    for (const op of vectorOperators) {
      if (op.test(contentStr)) {
        hasVectorOperators = true;
        break;
      }
    }

    for (const op of rasterOperators) {
      if (op.test(contentStr)) {
        hasRasterOperators = true;
        break;
      }
    }

    let verdict: 'True Vector' | 'Raster in Vector Container' | 'Mixed Content';
    let explanation: string;

    if (hasVectorOperators && !hasRasterOperators) {
      verdict = 'True Vector';
      explanation = 'This EPS file contains PostScript vector drawing operators and no raster image data. It is a true vector graphic that will scale perfectly at any size.';
    } else if (hasRasterOperators && !hasVectorOperators) {
      verdict = 'Raster in Vector Container';
      explanation = 'This EPS file contains PostScript raster image operators but no vector drawing commands. It is a raster image wrapped in EPS format. Scaling will result in pixelation.';
    } else if (hasVectorOperators && hasRasterOperators) {
      verdict = 'Mixed Content';
      explanation = 'This EPS file contains both PostScript vector drawing operators and raster image data. It is a hybrid file with both vector and raster content.';
    } else {
      // No vector or raster operators found - default to raster container
      verdict = 'Raster in Vector Container';
      explanation = 'This EPS file does not contain recognizable PostScript vector drawing operators. It appears to be a raster image or simple graphic wrapped in EPS format.';
    }

    return {
      fileType: 'EPS',
      verdict,
      explanation,
      hasVectorElements: hasVectorOperators,
      hasRasterElements: hasRasterOperators,
      details: {
        hasVectorOperators,
        hasRasterOperators,
      },
    };
  } catch (error) {
    throw new Error(`Failed to analyze EPS: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Analyzes an AI (Adobe Illustrator) file
 * AI files are essentially PDF-compatible, so we use PDF analysis
 */
export async function analyzeAI(filePath: string): Promise<DetectionResult> {
  try {
    const result = await analyzePDF(filePath);
    return {
      ...result,
      fileType: 'AI (Adobe Illustrator)',
    };
  } catch (error) {
    throw new Error(`Failed to analyze AI file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main analysis function that routes to the appropriate analyzer based on file type
 */
export async function analyzeFile(filePath: string, fileName: string): Promise<DetectionResult> {
  const ext = path.extname(fileName).toLowerCase();

  switch (ext) {
    case '.svg':
      return analyzeSVG(filePath);
    case '.pdf':
      return analyzePDF(filePath);
    case '.eps':
      return analyzeEPS(filePath);
    case '.ai':
      return analyzeAI(filePath);
    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }
}

/**
 * Validates file type based on extension
 */
export function isValidFileType(fileName: string): boolean {
  const validExtensions = ['.svg', '.pdf', '.eps', '.ai'];
  const ext = path.extname(fileName).toLowerCase();
  return validExtensions.includes(ext);
}

/**
 * Gets human-readable file type name
 */
export function getFileTypeName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const typeMap: Record<string, string> = {
    '.svg': 'SVG',
    '.pdf': 'PDF',
    '.eps': 'EPS',
    '.ai': 'Adobe Illustrator',
  };
  return typeMap[ext] || 'Unknown';
}
