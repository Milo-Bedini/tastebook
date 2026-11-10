import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { secretsOutsideSteps } from '../secrets.ts';

const directory = join(import.meta.dirname, '../../../.github/workflows');
const files = (await readdir(directory)).filter((file) => /\.ya?ml$/.test(file)).sort();

const results = await Promise.all(
  files.map(async (file) => ({
    file,
    paths: secretsOutsideSteps(await readFile(join(directory, file), 'utf8'))
  }))
);
const found = results.flatMap(({ file, paths }) =>
  paths.map(
    (path) =>
      `::error file=.github/workflows/${file}::${path} reads a secret. Move it to the env of the step that uses it.`
  )
);

if (found.length > 0) {
  console.log(found.join('\n'));
  process.exit(1);
}
console.log(`No secrets in a workflow's, job's or job container's env (${files.length} workflows).`);
