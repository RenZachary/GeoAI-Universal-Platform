/**
 * Type declarations for pdf-parse module
 */

declare module 'pdf-parse' {
  interface PDFInfo {
    Title?: string;
    Author?: string;
    Subject?: string;
    Keywords?: string;
    Creator?: string;
    Producer?: string;
    CreationDate?: string;
    ModDate?: string;
    Trapped?: string;
  }

  interface PDFMetadata {
    info: PDFInfo;
    metadata?: any;
    totalPages?: number;
  }

  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: PDFInfo;
    metadata?: any;
    text: string;
    version: string;
  }

  function pdfParse(dataBuffer: Buffer, options?: any): Promise<PDFParseResult>;

  export = pdfParse;
}
