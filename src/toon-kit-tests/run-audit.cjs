const fs = require('node:fs');
const path = require('node:path');
const {bundle} = require('@remotion/bundler');
const {openBrowser, selectComposition, renderStill} = require('@remotion/renderer');
const http = require('node:http');
const crypto=require('node:crypto');

(async () => {
  const out = path.resolve(process.env.TOON_AUDIT_OUT || 'out/phase1.1-audit'); fs.mkdirSync(out, {recursive: true});
  const serveUrl = await bundle({entryPoint: path.resolve('src/toon-kit-tests/audit.tsx')});
  const browser = await openBrowser('chrome', {chromiumOptions: {gl: process.env.TOON_GL || 'swangle'}});
  let fontsServed = 0;
  const server = http.createServer((req, res) => {
    if (req.url !== '/audit.ttf') {res.writeHead(404).end(); return;}
    setTimeout(() => {fontsServed++; res.writeHead(200, {'Content-Type': 'font/ttf', 'Access-Control-Allow-Origin': '*'}); res.end(fs.readFileSync(['C:/Windows/Fonts/arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'].find((file) => fs.existsSync(file)) || (() => {throw new Error('Audit needs an installed TTF font');})()));}, 120);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const inputProps = {fontUrl: `http://127.0.0.1:${server.address().port}/audit.ttf`};
  const logs = [];
  const onBrowserLog = ({text, type}) => {
    if (text.startsWith('AUDIT_IMAGE:')) {
      const {name, png} = JSON.parse(text.slice('AUDIT_IMAGE:'.length));
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    } else if (text.startsWith('AUDIT_RESULTS:')) {
      const results = JSON.parse(text.slice('AUDIT_RESULTS:'.length));
      fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
      results.forEach((result) => console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}`));
      if(results.some((result)=>!result.pass)) process.exitCode=1;
    } else {
      logs.push({type, text});
      if (text.startsWith('AUDIT_') || type === 'error') console.log(text);
      if(text.startsWith('AUDIT_BRIDGE_ORDER:') || text.startsWith('AUDIT_PENDING_UNMOUNT:')) if(!JSON.parse(text.slice(text.indexOf(':')+1)).pass) process.exitCode=1;
    }
  };
  try {
    for (const id of ['Phase1Audit', 'Phase1Lifecycle', 'Phase1BridgeOrder', 'Phase1BridgeStatic', 'Phase1PendingUnmount', 'Phase1Failure','Phase1FrameFailure']) {
      const composition = await selectComposition({serveUrl, id, puppeteerInstance: browser, inputProps});
      try {
        await renderStill({serveUrl, composition, frame: 0, inputProps, output: path.join(out, id + '.png'), puppeteerInstance: browser, chromiumOptions: {gl: process.env.TOON_GL || 'swangle'}, onBrowserLog, timeoutInMilliseconds: 60000});
        if (id === 'Phase1Failure'||id==='Phase1FrameFailure') throw new Error('Expected failure did not cancel capture');
      } catch (error) {
        const expected=id==='Phase1Failure'?'AUDIT_EXPECTED_ASSET_FAILURE':id==='Phase1FrameFailure'?'AUDIT_EXPECTED_FRAME_FAILURE':null;
        if (!expected || !String(error).includes(expected)) throw error;
        const message=id==='Phase1Failure'?'PASS rejected asset cancels capture':'PASS rejected onFrame cancels capture';
        logs.push({type: 'audit', text:message});console.log(message);
      }
      console.log('RENDERED ' + id);
    }
    const composition=await selectComposition({serveUrl,id:'UniversalClinicEndToEnd',puppeteerInstance:browser,inputProps}),hashes=[];
    for(const frame of [0,80,20,80,0]){
      const output=path.join(out,`clinic-composition-${hashes.length}-${frame}.png`);
      await renderStill({serveUrl,composition,frame,inputProps,output,puppeteerInstance:browser,chromiumOptions:{gl:process.env.TOON_GL||'swangle'},onBrowserLog,timeoutInMilliseconds:60000});
      hashes.push({frame,hash:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex')});
    }
    const pass=hashes[0].hash===hashes[4].hash&&hashes[1].hash===hashes[3].hash&&new Set(hashes.map(x=>x.hash)).size===3;
    console.log('AUDIT_CLINIC_COMPOSITION:'+JSON.stringify({pass,hashes}));if(!pass)throw new Error('Whole clinic composition including captions is nondeterministic');
  } finally {logs.push({fontsServed}); fs.writeFileSync(path.join(out, 'browser-log.json'), JSON.stringify(logs, null, 2)); server.close(); await browser.close({silent: true});}
})().catch((error) => {console.error(error); process.exitCode = 1;});
