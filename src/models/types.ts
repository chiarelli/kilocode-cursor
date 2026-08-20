export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  aliases?: string[];
}

export interface DiscoveryConfig {
  cacheTTL?: number; // milliseconds
  fallbackModels?: ModelInfo[];
}