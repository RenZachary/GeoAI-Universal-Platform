export interface UploadedFile {
  originalname: string;
  filename: string;
  path: string;
  size: number;
  mimetype: string;
}

export interface UploadResult {
  id: string;
  name: string;
  type: string;
  size: number;
  metadata: any;
  uploadedAt: Date;
}

export interface ShapefileComponents {
  shp: string;
  shx?: string;
  dbf?: string;
  prj?: string;
}
