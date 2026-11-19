import { CLASSIC_ROLE_IDS, readyBot } from "./ready-bots";

export interface BotRole {
  id: string;
  name: string;
  title: string;
  description: string;
  soul: string;
  apps: string[];
}

export const BOT_ROLES: BotRole[] = CLASSIC_ROLE_IDS.map((id) => {
  const { name, title, description, soul, apps } = readyBot(id)!;
  return { id, name, title, description, soul, apps };
});

export function botRole(id: string): BotRole | undefined {
  return BOT_ROLES.find((role) => role.id === id);
}

export function roleProfilePatch(role: BotRole, localized?: { name: string; title: string; description: string }): {
  name: string;
  title: string;
  description: string;
  soul: string;
} {
  // A role picked in Chinese should not land as an English name and title on the new bot.
  return {
    name: localized?.name ?? role.name,
    title: localized?.title ?? role.title,
    description: localized?.description ?? role.description,
    soul: role.soul,
  };
}
