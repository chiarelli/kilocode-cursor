export interface PluginConfig {
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  timeoutMs?: number;
  persistSessions?: boolean;
  sessionRetentionDays?: number;
}
