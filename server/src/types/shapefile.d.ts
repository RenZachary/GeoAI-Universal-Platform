/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'shapefile' {
  export function open(path: string): Promise<{
    read(): Promise<any>;
  }>;
}
