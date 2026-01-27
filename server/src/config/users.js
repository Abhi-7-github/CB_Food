import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function moduleDir() {
  const filename = fileURLToPath(import.meta.url);
  return path.dirname(filename);
}

function resolveUsersFile() {
  const envPath =
    typeof process.env.USERS_FILE === "string"
      ? process.env.USERS_FILE.trim()
      : "";
  if (envPath)
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(process.cwd(), envPath);

  // Default to src/config/users.json next to this file.
  return path.resolve(moduleDir(), "users.json");
}

function normalizeIdentifier(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function loadUsers() {
  const usersFile = resolveUsersFile();

  let raw = "[]";
  try {
    raw = await fs.readFile(usersFile, "utf8");
  } catch {
    // If missing, fall back to sample list (no users).
    return [];
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in USERS_FILE: ${usersFile}`);
  }

  if (!Array.isArray(data)) {
    throw new Error(`USERS_FILE must contain a JSON array: ${usersFile}`);
  }

  return data
    .filter((u) => u && typeof u === "object")
    .map((u) => ({
      teamName: String(u.teamName ?? ""),
      password: String(u.password ?? ""),
      identifierTeamName: normalizeIdentifier(u.teamName),
    }))
    .filter((u) => Boolean(u.password) && Boolean(u.identifierTeamName));
}

export function findUserByIdentifier(users, identifier) {
  const needle = normalizeIdentifier(identifier);
  if (!needle) return null;

  return (
    users.find(
      (u) => u.identifierTeamName && u.identifierTeamName === needle,
    ) || null
  );
}

export function publicUser(user) {
  if (!user) return null;
  const teamName = String(user.teamName || "").trim();
  const accountKey = normalizeIdentifier(teamName);
  return {
    id: accountKey,
    teamName,
    // accountKey is what we store on orders + userData
    accountKey,
  };
}
