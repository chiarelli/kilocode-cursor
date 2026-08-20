export interface ProxyConfig {
  port?: number;
  host?: string;
  healthCheckPath?: string;
  requestTimeout?: number;
}

export interface ProxyServer {
  start(): Promise<string>;
  stop(): Promise<void>;
  getBaseURL(): string;
  getPort(): number | null;
}
