import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { secretsOutsideSteps } from './secrets.ts';

describe('secretsOutsideSteps', () => {
  const cases: [string, string, string[]][] = [
    [
      "a secret in the workflow's env",
      `
env:
  TOKEN: \${{ secrets.TOKEN }}
jobs:
  build:
    steps:
      - run: make
`,
      ['env.TOKEN']
    ],
    [
      "a secret in a job's env",
      `
jobs:
  build:
    env:
      DEBUG: "true"
      TOKEN: \${{ secrets.TOKEN }}
    steps:
      - run: make
`,
      ['jobs.build.env.TOKEN']
    ],
    [
      'a secret by index, inside a longer value',
      `
jobs:
  build:
    env:
      URL: https://\${{ secrets['USER'] }}@example.com
`,
      ['jobs.build.env.URL']
    ],
    [
      "a job's whole env from the secrets",
      `
jobs:
  build:
    env: \${{ fromJSON(secrets.BUILD_ENV) }}
`,
      ['jobs.build.env']
    ],
    [
      "a secret only in a step's env",
      `
env:
  DEBUG: "true"
jobs:
  build:
    steps:
      - run: make
        env:
          TOKEN: \${{ secrets.TOKEN }}
`,
      []
    ],
    [
      'secrets passed to a reusable workflow',
      `
jobs:
  stage:
    uses: owner/repo/.github/workflows/stage.yml@main
    secrets:
      TOKEN: \${{ secrets.TOKEN }}
`,
      []
    ],
    [
      'an input that happens to be called secrets',
      `
jobs:
  build:
    env:
      NAMES: \${{ inputs.secrets }}
`,
      []
    ]
  ];

  for (const [label, source, expected] of cases) {
    it(`finds ${expected.length === 0 ? 'nothing in' : expected.join(', ')} for ${label}`, () => {
      assert.deepEqual(secretsOutsideSteps(source), expected);
    });
  }
});
