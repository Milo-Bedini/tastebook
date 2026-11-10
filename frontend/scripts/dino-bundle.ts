// Builds the files of the Dino Design System artifact that come from code: the components bundle and its CSS, their
// types, the fonts, tokens.json and tokens.css. The artifact's guidelines and previews are written there, not here.
// Usage: pnpm dino:bundle, from the repo root. Writes frontend/dino-bundle/project/, laid out as the artifact's files.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { build, type Plugin } from 'vite';

const frontend = resolve(import.meta.dirname, '..');
const repo = resolve(frontend, '..');
const src = join(frontend, 'src');
const dino = join(src, 'dino');
const out = join(frontend, 'dino-bundle');
const project = join(out, 'project');

const read = (path: string) => readFileSync(path, 'utf8');
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

// What a republish compares with main to tell whether the artifact is behind, as git pathspecs from the repo root.
const inputs = [
  'frontend/src/dino',
  ':(exclude)frontend/src/dino/*.stories.tsx',
  'frontend/src/main.tsx',
  'frontend/package.json',
  'frontend/scripts/dino-bundle.ts',
  'frontend/scripts/dino-react-router.ts',
  'docs/design.md'
];

// The components, from index.ts's export lines.
type DinoExport = { name: string; file: string };

const dinoExports: DinoExport[] = [
  ...read(join(dino, 'index.ts')).matchAll(/^export \{([^}]+)\} from '\.\/([\w-]+)';$/gm)
].flatMap(([, names = '', file = '']) =>
  names
    .split(',')
    .map((name) => name.trim())
    .filter((name) => !name.startsWith('type '))
    .map((name) => ({ name, file }))
);
const components = dinoExports.filter(({ name }) => /^[A-Z]/.test(name));
const componentFiles = [...new Set(components.map(({ file }) => file))];

// The page supplies React 18 as globals, which has no automatic JSX runtime, so JSX goes through createElement.
const jsxRuntime = `import { createElement, Fragment } from 'react';
const jsx = (type, props, key) => createElement(type, key === undefined ? props : { ...props, key });
export { Fragment, jsx, jsx as jsxs, jsx as jsxDEV };`;

const entry = `import ${JSON.stringify(join(dino, 'picnic.css'))};
export * from ${JSON.stringify(join(dino, 'index.ts'))};
export * as icons from 'lucide-react';`;

const virtualModules: Record<string, string> = {
  'react/jsx-runtime': jsxRuntime,
  'react/jsx-dev-runtime': jsxRuntime
};

const virtual = (): Plugin => ({
  name: 'dino-virtual-modules',
  enforce: 'pre',
  resolveId: (id) => (id in virtualModules ? `\0${id}` : undefined),
  load: (id) => (id.startsWith('\0') ? virtualModules[id.slice(1)] : undefined)
});

// Tokens: picnic.css's declarations, with each one's use from docs/design.md's tables or the comment above it.
type Declaration = { name: string; value: string; comment?: string };

const declarationsIn = (block: string): Declaration[] =>
  block.split(/\n\s*\n/).flatMap(
    (paragraph) =>
      [...paragraph.matchAll(/(?:\/\*\s*([\s\S]*?)\s*\*\/\s*)?--([\w-]+(?:\*)?):\s*([^;]+);/g)].reduce<{
        comment?: string;
        found: Declaration[];
      }>(
        ({ comment, found }, [, ownComment, name = '', value = '']) => {
          // A comment above a reset (--color-*: initial) is about the reset, not the tokens after it.
          if (value === 'initial') return { comment: undefined, found };
          const current = ownComment ?? comment;
          return { comment: current, found: [...found, { name, value: value.trim(), comment: current }] };
        },
        { found: [] }
      ).found
  );

const blockAfter = (css: string, opening: RegExp) => {
  const start = css.search(opening);
  if (start === -1) throw new Error(`picnic.css has no block matching ${opening}`);
  const body = css.indexOf('{', start) + 1;
  return css.slice(body, css.indexOf('}', body));
};

const picnic = read(join(dino, 'picnic.css'));
const declarations = [
  ...declarationsIn(blockAfter(picnic, /@theme static \{/)),
  ...declarationsIn(blockAfter(picnic, /^:root \{/m))
];

const tableRows = (markdown: string, heading: string) => {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`docs/design.md has no "## ${heading}" section`);
  const end = markdown.indexOf('\n## ', start + 1);
  return markdown
    .slice(start, end === -1 ? undefined : end)
    .split('\n')
    .filter((line) => line.startsWith('|') && !line.startsWith('| ---'))
    .slice(1)
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim())
    );
};

const design = read(join(repo, 'docs/design.md'));

const colourUses = new Map(
  tableRows(design, 'Colour').map(([token = '', , use = '', contrast = '']) => [
    token.replaceAll('`', '').replace(/^--/, ''),
    contrast ? `${use}. Contrast ${contrast}.` : `${use}.`
  ])
);

type TypeRole = { family: 'serif' | 'sans'; italic: boolean; use: string };

const typeRoles = new Map(
  tableRows(design, 'Type').map(([role = '', face = '']): [string, TypeRole] => {
    const name = role.replace(/ \(.+\)$/, '');
    return [
      name.toLowerCase().replaceAll(' ', '-'),
      { family: face.includes('Serif') ? 'serif' : 'sans', italic: face.includes('italic'), use: role }
    ];
  })
);

const declared = (name: string) => declarations.find((declaration) => declaration.name === name)?.value;
const sentence = (text: string) => `${text[0]?.toUpperCase()}${text.slice(1)}${text.endsWith('.') ? '' : '.'}`;
const resolveVars = (value: string) =>
  value.replace(/var\(--([\w-]+)\)/g, (match, name: string) => declared(name) ?? match);

const colours = declarations
  .filter(({ name }) => name.startsWith('color-'))
  .map(({ name, value, comment }) => ({
    name,
    value,
    usage: colourUses.get(name) ?? (comment ? sentence(comment) : `Tailwind's ${name.replace('color-', '')} colour.`)
  }));

const shapeNote = "docs/design.md's Space and shape";
const familyTokens = (prefix: string, usage: (name: string) => string) =>
  declarations
    .filter(({ name }) => name.startsWith(prefix))
    .map(({ name, value, comment }) => ({
      name,
      value: resolveVars(value),
      usage: comment ? sentence(comment) : usage(name)
    }));

const spacing = familyTokens('spacing', () => `Tailwind's spacing unit (${shapeNote}).`);
const radius = familyTokens(
  'radius-',
  (name) => `The \`rounded-${name.slice('radius-'.length)}\` corner (${shapeNote}).`
);
const shadow = familyTokens('shadow-', (name) => `The \`${name}\` shadow (${shapeNote}).`);
const timing = familyTokens(
  'default-transition-',
  (name) => `Every transition utility's ${name.slice('default-transition-'.length).replace('-', ' ')} (${shapeNote}).`
);

const typeStyles = declarations
  .filter(({ name }) => name.startsWith('text-') && !name.includes('--'))
  .map(({ name, value }) => {
    const style = name.slice('text-'.length);
    const role = typeRoles.get(style);
    return {
      family: role?.family ?? 'sans',
      style: {
        name: style,
        fontSize: value,
        lineHeight: declared(`${name}--line-height`),
        fontWeight: Number(declared(`${name}--font-weight`) ?? 400),
        ...(role?.italic ? { fontStyle: 'italic' } : {}),
        usage: `${role ? sentence(role.use) : ''} Tailwind \`${name}\`.`.trim()
      }
    };
  });

// Fonts: the faces main.tsx imports, latin only, as the artifact serves them to every canvas.
const fontImports = [...read(join(src, 'main.tsx')).matchAll(/'@fontsource\/([\w-]+)\/(\d+)(-italic)?\.css'/g)].map(
  ([, pack = '', weight = '', italic]) => ({ pack, weight, style: italic ? 'italic' : 'normal' })
);
const fontFamily = (pack: string) =>
  /font-family:\s*'([^']+)'/.exec(read(join(frontend, 'node_modules/@fontsource', pack, 'index.css')))?.[1] ?? pack;
const fonts = fontImports.map(({ pack, weight, style }) => ({
  family: fontFamily(pack),
  file: `fonts/${pack}-latin-${weight}-${style}.woff2`,
  weight,
  style,
  from: join(frontend, 'node_modules/@fontsource', pack, 'files', `${pack}-latin-${weight}-${style}.woff2`)
}));

const families = Object.fromEntries(
  declarations
    .filter(({ name }) => name.startsWith('font-'))
    .map(({ name, value }) => [name.slice('font-'.length), value])
);

const head = git('rev-parse', '--short', 'HEAD');
const uncommitted = git('status', '--porcelain', '--', ...inputs) !== '';
const ref = `${git('rev-parse', '--abbrev-ref', 'HEAD')}@${head}${uncommitted ? '+uncommitted' : ''}`;

const tokens = {
  name: 'Dino',
  version: 1,
  color: { themes: [{ id: 'dark', name: 'Dark' }], tokens: colours },
  type: {
    fonts: fonts.map(({ from: _from, ...font }) => font),
    families,
    groups: [
      { name: 'Display', family: 'serif', styles: typeStyles.filter((t) => t.family === 'serif').map((t) => t.style) },
      { name: 'Text', family: 'sans', styles: typeStyles.filter((t) => t.family === 'sans').map((t) => t.style) }
    ]
  },
  spacing: { tokens: spacing },
  radius: { tokens: radius },
  shadow: { tokens: shadow },
  timing: { note: 'Motion. Nothing moves on its own except a running timer and a spinner.', tokens: timing },
  meta: {
    source: 'github',
    repo: 'Milo-Bedini/tastebook',
    ref,
    package: 'frontend',
    paths: { tokens: ['frontend/src/dino/picnic.css'], fonts: ['frontend/src/main.tsx'], docs: ['docs/design.md'] },
    inputs,
    components: Object.fromEntries(components.map(({ name, file }) => [name, `frontend/src/dino/${file}.tsx`])),
    synced: new Date().toISOString().slice(0, 10)
  }
};

// The artifact's page recompiles tokens.css from tokens.json only when someone saves a change there, so it's written
// here too, laid out as the page writes it.
type CustomProperty = { name: string; value: string };

const ruleOf = (selector: string, properties: CustomProperty[]) =>
  `${selector} {\n${properties.map(({ name, value }) => `  --${name}: ${value};`).join('\n')}\n}`;

const tokensCss = [
  '/* Dino — generated from tokens.json */',
  ruleOf(':root, [data-theme="dark"]', [...colours, ...shadow]),
  ruleOf(':root', [
    ...spacing,
    ...radius,
    ...timing,
    ...Object.entries(families).map(([key, value]) => ({ name: `font-${key}`, value }))
  ]),
  ...typeStyles.map(
    ({ family, style }) =>
      `.${style.name} { font-family: var(--font-${family}); font-size: ${style.fontSize}; line-height: ${style.lineHeight}; font-weight: ${style.fontWeight};${style.fontStyle ? ` font-style: ${style.fontStyle};` : ''} }`
  ),
  ...fonts.map(
    ({ family, file, weight, style }) =>
      `@font-face { font-family: "${family}"; src: url("${file}") format("woff2"); font-weight: ${weight}; font-style: ${style}; font-display: swap; }`
  )
].join('\n');

// The artifact declares the tokens in tokens.css, so the bundle's CSS drops the declarations it would repeat.
const tokenNames = [
  ...[colours, spacing, radius, shadow, timing].flat().map(({ name }) => name),
  ...Object.keys(families).map((key) => `font-${key}`)
];

// Types: tsc's declarations for each component's file, in one file as the artifact wants, its own types exported.
const declarationTypes = () => {
  const tmp = join(out, 'tmp');
  writeFileSync(
    join(tmp, 'tsconfig.json'),
    JSON.stringify({
      extends: join(frontend, 'tsconfig.app.json'),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        types: [],
        rootDir: src,
        outDir: join(tmp, 'types'),
        tsBuildInfoFile: null
      },
      include: [],
      files: [join(dino, 'index.ts')]
    })
  );
  execFileSync(join(repo, 'node_modules/.bin/tsc'), ['-p', join(tmp, 'tsconfig.json')], { stdio: 'inherit' });

  const sections = componentFiles.map((file) => ({
    file,
    text: read(join(tmp, 'types/dino', `${file}.d.ts`))
  }));
  // Every import in a declaration file is of types, so each package's names merge into one import type line.
  const imported = sections.flatMap(({ text }) =>
    [...text.matchAll(/^import (?:type )?\{([^}]+)\} from '([^'./@][^']*|@(?!\/)[^']+)';$/gm)].flatMap(
      ([, names = '', module = '']) =>
        names.split(',').map((name) => ({ module, name: name.replace('type ', '').trim() }))
    )
  );
  const packageImports = [...new Set(imported.map(({ module }) => module))].map((module) => {
    const names = [...new Set(imported.filter((entry) => entry.module === module).map(({ name }) => name))].sort();
    return `import type { ${names.join(', ')} } from '${module}';`;
  });
  const body = sections.map(
    ({ file, text }) =>
      `// ${file}.tsx\n${text
        .replace(/^import [^;]+;\n/gm, '')
        .replace(/^export \{\};\n/gm, '')
        .replace(/^type (\w+Props\b)/gm, 'export type $1')}`
  );
  return [...packageImports, '', ...body].join('\n');
};

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'tmp'), { recursive: true });
writeFileSync(join(out, 'tmp/entry.ts'), entry);

await build({
  configFile: false,
  root: frontend,
  publicDir: false,
  logLevel: 'warn',
  plugins: [virtual(), tailwindcss()],
  resolve: { alias: { '@': src, 'react-router': join(frontend, 'scripts/dino-react-router.ts') } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: join(project, 'components'),
    emptyOutDir: true,
    lib: {
      entry: join(out, 'tmp/entry.ts'),
      name: 'Dino',
      formats: ['iife'],
      fileName: () => 'bundle.js',
      cssFileName: 'bundle'
    },
    rolldownOptions: {
      // Radix, Sonner and Lucide mark their modules "use client", which means nothing in a bundle.
      onLog: (level, log, handler) => {
        if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log);
      },
      external: ['react', 'react-dom'],
      output: { globals: { react: 'React', 'react-dom': 'ReactDOM' } }
    }
  }
});

const bundlePath = join(project, 'components/bundle.js');
const bundle = read(bundlePath);
// Pages inline the bundle in a <script>, so either would end or escape it.
if (/<\/script|<!--/i.test(bundle)) throw new Error('bundle.js holds "</script" or "<!--"');
const header = { format: 4, namespace: 'Dino', components: components.map(({ name }) => ({ name })) };
writeFileSync(bundlePath, `/* @ds-bundle: ${JSON.stringify(header)} */\n${bundle}`);

const cssPath = join(project, 'components/bundle.css');
writeFileSync(
  cssPath,
  tokenNames.reduce((css, name) => css.replace(new RegExp(`--${name}:[^;}]+;?`, 'g'), ''), read(cssPath))
);

writeFileSync(join(project, 'components/index.d.ts'), declarationTypes());

mkdirSync(join(project, 'fonts'));
fonts.map(({ from, file }) => copyFileSync(from, join(project, file)));

writeFileSync(join(project, 'tokens.json'), `${JSON.stringify(tokens, null, 2)}\n`);
writeFileSync(join(project, 'tokens.css'), `${tokensCss}\n`);
rmSync(join(out, 'tmp'), { recursive: true });

const listing = (dir: string, prefix = ''): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listing(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`  project/${prefix}${entry.name} (${Math.ceil(statSync(join(dir, entry.name)).size / 1024)} KB)`]
  );

console.log(`Dino from ${ref}: ${components.length} components, ${tokenNames.length} tokens, ${fonts.length} fonts`);
console.log(listing(project).join('\n'));
if (uncommitted) console.warn('Uncommitted changes to the inputs: publish from a commit on main.');
