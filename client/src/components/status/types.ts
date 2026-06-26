/**
 * Type definitions for server status monitoring with BetterStack.
 * Includes:
 * - Service status types
 * - API response types
 * - Status attributes
 *
 */

export interface ServiceStatus {
  color: string;
  description: string;
  label: string;
}

export interface ServerStatusResponse {
  status: "online" | "offline";
  uptime: number;
  users: number;
}
