import { PermissionFlagsBits, type GuildMember } from 'discord.js';

import type { GuildSettings } from '../settings/guild-settings.js';

export function canManageConfiguration(
  permissions: Readonly<{ has(permission: bigint): boolean }> | null,
  member: GuildMember | null,
  settings?: GuildSettings,
): boolean {
  if (hasAdministratorOrManageGuild(permissions)) return true;
  return hasConfiguredRole(member, settings?.configRoleIds);
}

export function canControlRadio(
  permissions: Readonly<{ has(permission: bigint): boolean }> | null,
  member: GuildMember | null,
  settings?: GuildSettings,
): boolean {
  if (hasAdministratorOrManageGuild(permissions)) return true;
  if (settings?.publicControlEnabled) return true;
  return hasConfiguredRole(member, settings?.controlRoleIds);
}

function hasAdministratorOrManageGuild(
  permissions: Readonly<{ has(permission: bigint): boolean }> | null,
): boolean {
  const isAdministrator = permissions?.has(PermissionFlagsBits.Administrator) ?? false;
  const canManageGuild = permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
  return isAdministrator || canManageGuild;
}

function hasConfiguredRole(
  member: GuildMember | null,
  roleIds: readonly string[] | undefined,
): boolean {
  if (!member || !roleIds?.length) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}
