export interface SourcePackageImage {
  id: string;
  src: string;
  pageNumber: number;
  description?: string;
  width?: number;
  height?: number;
  byteLength?: number;
}

export interface SourcePackageImageStats {
  rawCount: number;
  keptCount: number;
  filteredSmallCount: number;
  filteredLargeCount: number;
  filteredLimitCount: number;
  dedupedCount: number;
}
