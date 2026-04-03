import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const now = new Date().toISOString();
const reconstructionDir = path.join(process.cwd(), 'reconstruction');
const manifestPath = path.join(reconstructionDir, 'manifest.json');

mkdirSync(reconstructionDir, { recursive: true });
mkdirSync(path.join(reconstructionDir, 'sources'), { recursive: true });
mkdirSync(path.join(reconstructionDir, 'reports'), { recursive: true });

let existingEntries: Array<Record<string, unknown>> = [];

try {
  const existing = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    entries?: Array<Record<string, unknown>>;
  };
  if (Array.isArray(existing.entries)) {
    existingEntries = existing.entries;
  }
} catch {
  // no existing manifest yet
}

const manifest = {
  version: 1,
  updatedAt: now,
  status: 'scaffold_only',
  note: 'Hydration automation is pending Item 2.2 in specs.md.',
  entries: existingEntries
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Updated scaffold manifest at ${manifestPath}`);
