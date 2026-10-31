'use strict';
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
// Compile with the installed compiler, not a substitute TypeScript loader.
execFileSync(process.execPath, [tsc, '-p', 'scripts/tsconfig.characters.json'], {cwd: root, stdio: 'inherit', windowsHide: true});
execFileSync(process.execPath, ['--test', '--test-concurrency=1', 'scripts/tests/characters.test.cjs', 'scripts/tests/constraints.test.cjs', 'scripts/tests/cast.test.cjs', 'scripts/tests/faces.test.cjs', 'scripts/tests/appearance.test.cjs', 'scripts/tests/walking.test.cjs'], {cwd: root, stdio: 'inherit', windowsHide: true});
