'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const P = require('../produce.cjs');
const QA = require('../qa.cjs');

const root = path.resolve(__dirname, '..', '..');
const work = path.join(root, 'out', 'test-produce-scratch');

test.before(() => {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
});

test.after(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

test('valid short story runs full one-shot production: validate -> render -> QA -> report', async () => {
  const planPath = 'examples/render-job-demo.story.json';
  const outputPath = path.join(work, 'demo.mp4');
  const reportPath = path.join(work, 'demo-production-report.json');
  const sheetPath = path.join(work, 'demo-contact-sheet.png');

  const report = await P.runProduce({
    plan: planPath,
    output: outputPath,
    report: reportPath,
    contactSheet: sheetPath,
    quiet: true
  });

  assert.ok(report.status === 'SUCCESS' || report.status === 'WARNINGS');
  assert.equal(report.plan.frames, 30);
  assert.equal(report.output.path, outputPath);
  assert.ok(fs.existsSync(outputPath), 'Output MP4 must exist');
  assert.ok(report.output.sizeBytes > 10000, 'Output MP4 must be non-empty');

  // Verify QA stage ran and passed
  assert.ok(report.qa, 'QA section must be present in report');
  assert.ok(report.qa.verdict === 'PASSED' || report.qa.verdict === 'WARNINGS');
  assert.equal(report.qa.checks.decodeIntegrity.status, 'PASSED');
  assert.equal(report.qa.checks.audioSync.status, 'PASSED');
  assert.equal(report.qa.checks.frameCount.status, 'PASSED');

  // Verify contact sheet
  assert.ok(fs.existsSync(sheetPath), 'Contact sheet must exist');
  assert.equal(report.contactSheet.path, sheetPath);

  // Verify review guidance
  assert.ok(report.guidance.technicalIntegrity.includes('PASSED'));
  assert.ok(report.guidance.visualReviewRequired.includes('visual review'));

  // Verify report file on disk
  assert.ok(fs.existsSync(reportPath), 'Production report file must exist');
  const diskReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(diskReport.status, report.status);
});

test('rejects malformed or invalid JSON plan before launching render', async () => {
  const badPlanPath = path.join(work, 'malformed.story.json');
  fs.writeFileSync(badPlanPath, JSON.stringify({
    version: 99,
    story: { scenes: 'not-an-array' }
  }));

  const outputPath = path.join(work, 'must-not-exist.mp4');

  await assert.rejects(
    P.runProduce({
      plan: badPlanPath,
      output: outputPath,
      quiet: true
    }),
    (err) => {
      assert.ok(err.diagnostic, 'Must throw structured diagnostic');
      assert.ok(/PLAN_FILE|AUTHORING_SCHEMA|AUTHORING_ARGUMENT|INVALID_DOCUMENT/.test(err.diagnostic.code));
      return true;
    }
  );

  assert.equal(fs.existsSync(outputPath), false, 'Must not render video on invalid plan');
});

test('rejects impossible composition during preflight before encoding', async () => {
  const bad = JSON.parse(fs.readFileSync('examples/long-story.json', 'utf8'));
  delete bad.story.audio;
  for (const scene of bad.story.scenes) {
    scene.cues = [];
    scene.beats = [];
  }
  const later = bad.story.scenes[1];
  later.characters.rhea.lookAt = { actor: 'arun' };
  later.characters.arun.lookAt = 'board';
  later.cues = [{
    id: 'impossible-caption',
    kind: 'caption',
    language: 'en',
    text: 'A narrow caption reserve '.repeat(14).trim(),
    mode: 'line',
    startFrame: later.startFrame,
    endFrame: later.endFrame
  }];

  const badPlanPath = path.join(work, 'bad-preflight.story.json');
  fs.writeFileSync(badPlanPath, JSON.stringify(bad));
  const badOutput = path.join(work, 'bad-preflight.mp4');

  await assert.rejects(
    P.runProduce({
      plan: badPlanPath,
      output: badOutput,
      quiet: true
    }),
    (err) => {
      const diagStr = JSON.stringify(err.diagnostic || {});
      return /NO_VALID_COMPOSITION|CAPTION_TOO_TALL|AUTHORING_FAILED/.test(diagStr);
    }
  );

  assert.equal(fs.existsSync(badOutput), false, 'Video must not be created on preflight failure');
});

test('safe handling of output and report paths prevents workspace traversal', async () => {
  await assert.rejects(
    P.runProduce({
      plan: 'examples/render-job-demo.story.json',
      output: path.join(root, 'scripts', 'evil.mp4'),
      quiet: true
    }),
    (err) => err.diagnostic?.code === 'OUTPUT_PATH'
  );

  await assert.rejects(
    P.runProduce({
      plan: 'examples/render-job-demo.story.json',
      output: 'out/../../escape.mp4',
      quiet: true
    }),
    (err) => err.diagnostic?.code === 'WORKSPACE_PATH' || err.diagnostic?.code === 'OUTPUT_PATH'
  );
});

test('validates existing completed 28-second MP4 with QA without re-rendering', async () => {
  const existingVideo = 'out/rahasyamayi-signal.mp4';
  const existingPlan = 'examples/rahasyamayi-signal.story.json';
  const reportPath = path.join(work, 'signal-qa-verify.json');
  const sheetPath = path.join(work, 'signal-sheet-verify.png');

  const start = Date.now();
  const qaReport = await QA.runQA({
    video: existingVideo,
    plan: existingPlan,
    report: reportPath,
    contactSheet: sheetPath,
    quiet: true
  });
  const elapsed = Date.now() - start;

  assert.equal(qaReport.verdict, 'PASSED');
  assert.equal(qaReport.video.frames, 840);
  assert.equal(qaReport.video.duration, 28);
  assert.ok(elapsed < 25000, `QA on completed video should run in <25s (took ${elapsed}ms)`);
  assert.ok(fs.existsSync(reportPath));
  assert.ok(fs.existsSync(sheetPath));
});
