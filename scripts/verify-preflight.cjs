'use strict';

// Actual guarded SwiftShader check; no custom scene/composition or camera math.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const {
  runAuthoredStory
} = require('./story.cjs');
const out = path.resolve('out/phase5b');
fs.mkdirSync(out, {
  recursive: true
});
async function main() {
  const bad = JSON.parse(fs.readFileSync('examples/long-story.json', 'utf8'));
  delete bad.story.audio;
  for (const scene of bad.story.scenes) {
    scene.cues = [];
    scene.beats = [];
  }
  const later = bad.story.scenes[1];
  later.characters.rhea.lookAt = {
    actor: 'arun'
  };
  later.characters.arun.lookAt = 'board';
  later.cues = [{
    id: 'impossible-reservation',
    kind: 'caption',
    language: 'en',
    text: 'A narrow caption reserve '.repeat(12).trim(),
    mode: 'line',
    startFrame: later.startFrame,
    endFrame: later.endFrame
  }];
  const badPlan = path.join(out, 'invalid-later.json'),
    badOutput = path.join(out, 'must-not-render.mp4'),
    badReport = path.join(out, 'invalid-report.json');
  fs.writeFileSync(badPlan, JSON.stringify(bad));
  assert.equal(fs.existsSync(badOutput), false, 'Use a fresh out/phase5b directory for verification');
  await assert.rejects(runAuthoredStory({
    command: 'render',
    plan: badPlan,
    output: badOutput,
    report: badReport
  }), e => /NO_VALID_COMPOSITION|CAPTION_TOO_TALL/.test(JSON.stringify(e.diagnostic)) && !!e.diagnostic?.report);
  const preflight = JSON.parse(fs.readFileSync(badReport + '.preflight.json'));
  assert.equal(preflight.job.mode, 'prepare');
  assert.equal(preflight.worker.preparations.length, 1);
  assert.equal(preflight.worker.runs.length, 0);
  assert.equal(preflight.worker.ffmpegArguments, undefined);
  assert.match(JSON.stringify(preflight.worker.diagnostic), /NO_VALID_COMPOSITION|CAPTION_TOO_TALL/);
  assert.equal(fs.existsSync(badOutput), false);
  assert.equal(fs.existsSync(badOutput + '.segments'), false, 'No first segment renderer was launched');
  const valid = structuredClone(bad);
  valid.story.scenes[1].cues = [];
  for (const actor of Object.values(valid.story.scenes[1].characters)) actor.lookAt = 'audience';
  const validPlan = path.join(out, 'valid-all-segments.json');
  fs.writeFileSync(validPlan, JSON.stringify(valid));
  const prepared = await runAuthoredStory({command:'prepare',plan:validPlan,report:path.join(out,'valid-all-report.json')});
  assert.equal(prepared.visibilityValidated,true);
  const all = JSON.parse(fs.readFileSync(prepared.preflightReport));
  assert.equal(all.worker.preparations.length,3);
  assert.equal(all.worker.runs.length,0);
  const good = JSON.parse(fs.readFileSync('examples/office-idea.story.json', 'utf8'));
  good.story.durationInFrames = 30;
  const scene = good.story.scenes[0];
  scene.endFrame = 30;
  scene.beats = [];
  scene.cues = [];
  scene.characters.meera.stance = {
    type: 'stand',
    at: 'finish'
  };
  scene.shots = [{
    id: 'seating',
    type: 'fullBody',
    subject: 'kabir',
    view: 'threeQuarter',
    startFrame: 0,
    endFrame: 30
  }];
  const goodPlan = path.join(out, 'office-seating.json'),
    output = path.join(out, 'office-seating.mp4');
  fs.writeFileSync(goodPlan, JSON.stringify(good));
  await runAuthoredStory({
    command: 'render',
    plan: goodPlan,
    output,
    report: path.join(out, 'office-seating-report.json'),
    verify: true
  });
  const results = {
    validSegmentsPrepared: all.worker.preparations.length,
    invalidLaterRejected: true,
    noVideoBeforeFailure: true,
    preflightSegmentsCompleted: preflight.worker.preparations.length,
    diagnostic: preflight.worker.diagnostic,
    preview: output
  };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log('PREFLIGHT_VERIFIED ' + JSON.stringify(results));
}
main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
