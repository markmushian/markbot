/**
 * Reads this connector's own settings. Every one of them is `MARKBOT_*`: the pre-rename prefix is gone, so a container
 * left over from that build has to be reinstalled rather than half-read.
 */
export function connectorEnv(name: string): string | undefined {
  const value = process.env[`MARKBOT_${name}`];
  return value !== undefined && value !== "" ? value : undefined;
}

/** The prefix a container's own settings use. */
export const CONNECTOR_ENV_PREFIX = "MARKBOT_";

/** True for a variable this connector owns. */
export function isConnectorEnv(name: string): boolean {
  return name.startsWith(CONNECTOR_ENV_PREFIX);
}
