declare module '@turf/turf' {
  export function buffer(geojson: any, distance: number, options?: { units?: string }): any;
  export function dissolve(geojson: any): any;
  export function bbox(geojson: any): [number, number, number, number];
  export function intersect(feature1: any, feature2: any): any;
  export function union(feature1: any, feature2: any): any;
  export function difference(feature1: any, feature2: any): any;
}
