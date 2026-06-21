import fs from 'node:fs';
import path from 'node:path';

export function loadMaintenanceEnvFiles(root = process.cwd(), names = ['.env', '.env.local']) {
  for (const name of names) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;

    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || line.trim().startsWith('#')) continue;

      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] ??= value;
    }
  }
}

export function assertSafeTeachingControlWrite(scriptName) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(`${scriptName} requires DATABASE_URL before it can update StudyMemory.`);
  }

  let hostname = '';
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    throw new Error(`${scriptName} found an invalid DATABASE_URL.`);
  }

  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  const allowRemote =
    process.env.ALLOW_REMOTE_TEACHING_MEMORY_WRITE === '1' ||
    process.argv.includes('--allow-remote-teaching-memory-write');

  if (!isLocal && !allowRemote) {
    throw new Error(
      [
        `${scriptName} refused to update a non-local database (${hostname}).`,
        'Run against a local DATABASE_URL, or pass --allow-remote-teaching-memory-write / set ALLOW_REMOTE_TEACHING_MEMORY_WRITE=1 after confirming the target.',
      ].join(' '),
    );
  }
}
