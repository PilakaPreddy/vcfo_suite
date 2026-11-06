import { writeFileSync } from 'node:fs';
import { buildFieldCatalog } from '@/lib/ask/field-catalog/build';

/** Writes the field catalog from its source files. `src/lib/ask/field-catalog/catalog.test.ts` fails when it is stale. */
const entries = buildFieldCatalog();
writeFileSync('src/lib/ask/field-catalog/catalog.generated.json', `${JSON.stringify(entries)}\n`);
console.log(`${entries.length} entries written.`);
