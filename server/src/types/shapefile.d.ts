declare module 'shapefile' {
  export function open(path: string): Promise<{
    read(): Promise<any>;
  }>;
}
