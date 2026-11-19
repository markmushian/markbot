// Team file identifiers: the one this release writes and the one releases before
// the rename wrote. Every reader accepts both, every writer spells the current
// name, so a team exported by an older app still imports.
export const TEAM_FORMAT = "markbot.team" as const;
export const LEGACY_TEAM_FORMAT = "openmaus.team";

export function isTeamFormat(value: unknown): boolean {
  return value === TEAM_FORMAT || value === LEGACY_TEAM_FORMAT;
}
