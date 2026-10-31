'use strict';
const path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
execFileSync(process.execPath,[path.join(path.dirname(require.resolve('typescript/package.json')),'bin','tsc'),'-p','scripts/tsconfig.characters.json'],{cwd:root,stdio:'inherit',windowsHide:true});
execFileSync(process.execPath,['--test','--test-concurrency=1','scripts/tests/direction.test.cjs','scripts/tests/composition.test.cjs','scripts/tests/motion.test.cjs'],{cwd:root,stdio:'inherit',windowsHide:true});
