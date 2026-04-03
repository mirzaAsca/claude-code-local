import { readFileSync } from 'fs';
import path from 'path';

const reportsDir = path.join(process.cwd(), 'reconstruction', 'reports');
const requiredFiles = ['unresolved-runtime.json', 'unresolved-types.json', 'scan-summary.json'];

for (const filename of requiredFiles) {
  const fullPath = path.join(reportsDir, filename);
  try {
    JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch {
    console.error(`Missing or invalid JSON report: ${fullPath}`);
    process.exit(1);
  }
}

const unresolvedRuntime = JSON.parse(
  readFileSync(path.join(reportsDir, 'unresolved-runtime.json'), 'utf8')
) as {
  status?: string;
  unresolved?: unknown[];
};

if (unresolvedRuntime.status === 'not_implemented') {
  console.warn('reconstruct:verify is running in scaffold mode. Implement Item 2.1/2.2 for authoritative verification.');
}

const unresolvedCount = Array.isArray(unresolvedRuntime.unresolved)
  ? unresolvedRuntime.unresolved.length
  : 0;

console.log(`reconstruct:verify completed (scaffold mode). unresolved runtime entries: ${unresolvedCount}`);
