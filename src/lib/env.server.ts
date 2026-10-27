/** Read an env var, treating empty/whitespace as unset. */
export function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}
