'use strict';

const path = require('node:path'),
  {
    execFileSync
  } = require('node:child_process'),
  root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc'), '-p', 'scripts/tsconfig.characters.json'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true
});
execFileSync(process.execPath, ['--test', '--test-concurrency=1', 'scripts/tests/story-audio.test.cjs', 'scripts/tests/story.test.cjs'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true
});
