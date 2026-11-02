'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const QA = require('../qa.cjs');
const root = path.resolve(__dirname, '..', '..');
const work = path.join(root, 'out', 'test-qa-scratch');

test.before(() => {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
});

test.after(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

test('valid silent story render passes all QA checks and produces contact sheet', async () => {
  const videoPath = 'out/rahasyamayi-signal.mp4';
  const planPath = 'examples/rahasyamayi-signal.story.json';
  const reportPath = path.join(work, 'signal-qa.json');
  const sheetPath = path.join(work, 'signal-sheet.png');

  const report = await QA.runQA({
    video: videoPath,
    plan: planPath,
    report: reportPath,
    contactSheet: sheetPath,
    quiet: true
  });

  assert.equal(report.verdict, 'PASSED');
  assert.equal(report.video.width, 720);
  assert.equal(report.video.height, 1280);
  assert.equal(report.video.fps, 30);
  assert.equal(report.video.frames, 840);
  assert.equal(report.video.isValid, true);
  assert.equal(report.audio.present, false);

  assert.equal(report.checks.decodeIntegrity.status, 'PASSED');
  assert.equal(report.checks.blackFrames.status, 'PASSED');
  assert.equal(report.checks.freezeFrames.status, 'PASSED');
  assert.equal(report.checks.dimensions.status, 'PASSED');
  assert.equal(report.checks.fps.status, 'PASSED');
  assert.equal(report.checks.frameCount.status, 'PASSED');
  assert.equal(report.checks.audioSync.status, 'PASSED');
  assert.equal(report.checks.storyContinuity.status, 'PASSED');

  assert.ok(fs.existsSync(reportPath), 'QA report JSON must exist');
  assert.ok(fs.existsSync(sheetPath), 'Contact sheet PNG must exist');

  // Verify contact sheet dimensions via ffprobe
  const probe = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=width,height',
    '-of', 'json',
    sheetPath
  ], { encoding: 'utf8' });
  const meta = JSON.parse(probe.stdout);
  assert.equal(meta.streams[0].width, 1080);
  assert.equal(meta.streams[0].height, 1920);
});

test('video-only mode marks script checks as NOT_EVALUATED and passes intact video', async () => {
  const videoPath = 'out/rahasyamayi-signal.mp4';
  const reportPath = path.join(work, 'video-only-qa.json');
  const sheetPath = path.join(work, 'video-only-sheet.png');

  const report = await QA.runQA({
    video: videoPath,
    report: reportPath,
    contactSheet: sheetPath,
    quiet: true
  });

  assert.equal(report.verdict, 'PASSED');
  assert.equal(report.plan.evaluated, false);
  assert.equal(report.checks.decodeIntegrity.status, 'PASSED');
  assert.equal(report.checks.dimensions.status, 'NOT_EVALUATED');
  assert.equal(report.checks.fps.status, 'NOT_EVALUATED');
  assert.equal(report.checks.frameCount.status, 'NOT_EVALUATED');
  assert.equal(report.checks.audioSync.status, 'NOT_EVALUATED');
  assert.equal(report.checks.storyContinuity.status, 'NOT_EVALUATED');
  assert.ok(fs.existsSync(sheetPath));
});

test('narrated story render verifies audio stream and correlates intentional static holds', async () => {
  const videoPath = 'out/phase5e-nikalna-v3-narrated.mp4';
  const planPath = 'examples/phase5e-nikalna-v3.story.json';
  const reportPath = path.join(work, 'narrated-qa.json');
  const sheetPath = path.join(work, 'narrated-sheet.png');

  const report = await QA.runQA({
    video: videoPath,
    plan: planPath,
    report: reportPath,
    contactSheet: sheetPath,
    quiet: true
  });

  assert.equal(report.verdict, 'PASSED');
  assert.equal(report.audio.present, true);
  assert.equal(report.audio.codec, 'aac');
  assert.equal(report.audio.channels, 2);
  assert.equal(report.checks.audioSync.status, 'PASSED');

  // Verify that static hold in objectFocus shot is recognized as INFO, not an error
  const holds = report.issues.filter(i => i.code === 'EXPECTED_STATIC_HOLD');
  assert.ok(holds.length > 0, 'Expected static hold should be detected and cataloged');
  assert.equal(holds[0].severity, 'INFO');
  assert.match(holds[0].message, /objectFocus/);
});

test('detects missing audio stream when plan requires audio', async () => {
  // Test silent video against an audio-requiring plan
  const silentVideo = 'out/rahasyamayi-signal.mp4';
  const audioPlan = 'examples/phase5e-nikalna-v3.story.json';
  const reportPath = path.join(work, 'missing-audio-qa.json');

  const report = await QA.runQA({
    video: silentVideo,
    plan: audioPlan,
    report: reportPath,
    quiet: true
  });

  assert.equal(report.verdict, 'FAILED');
  assert.equal(report.checks.audioSync.status, 'FAILED');
  const missing = report.issues.find(i => i.code === 'MISSING_AUDIO_STREAM');
  assert.ok(missing, 'Must find MISSING_AUDIO_STREAM issue');
  assert.equal(missing.severity, 'ERROR');
});

test('detects video dimension and frame count mismatches against plan', async () => {
  const dummyPlanPath = path.join(work, 'mismatch.story.json');
  const dummyPlan = {
    document: {
      video: { width: 1920, height: 1080 },
      story: {
        fps: 30,
        durationInFrames: 300,
        scenes: [{ id: 'test', startFrame: 0, endFrame: 300, shots: [] }]
      }
    }
  };
  fs.writeFileSync(dummyPlanPath, JSON.stringify(dummyPlan));

  const report = await QA.runQA({
    video: 'out/rahasyamayi-signal.mp4',
    plan: dummyPlanPath,
    report: path.join(work, 'mismatch-qa.json'),
    quiet: true
  });

  assert.equal(report.verdict, 'FAILED');
  assert.equal(report.checks.dimensions.status, 'FAILED');
  assert.equal(report.checks.frameCount.status, 'FAILED');

  assert.ok(report.issues.some(i => i.code === 'DIMENSION_MISMATCH'));
  assert.ok(report.issues.some(i => i.code === 'FRAME_COUNT_MISMATCH'));
});

test('detects unexpected black screen intervals on synthetic test video', () => {
  // Generate 3s synthetic clip: 0.8s green, 1.4s black, 0.8s green
  const blackClip = path.join(work, 'black-test.mp4');
  const res = spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'color=c=green:s=320x240:d=0.8,fps=30',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=1.4,fps=30',
    '-f', 'lavfi', '-i', 'color=c=green:s=320x240:d=0.8,fps=30',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1[v]',
    '-map', '[v]',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    blackClip
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0);

  const blackIntervals = QA.detectBlackFrames(blackClip, 0.2);
  assert.ok(blackIntervals.length >= 1);
  assert.ok(blackIntervals[0].duration >= 1.3);

  const reportPromise = QA.runQA({
    video: blackClip,
    report: path.join(work, 'black-report.json'),
    contactSheet: path.join(work, 'black-sheet.png'),
    blackThresh: 0.2,
    quiet: true
  });

  return reportPromise.then((report) => {
    assert.equal(report.verdict, 'FAILED');
    assert.equal(report.checks.blackFrames.status, 'FAILED');
    const blackIssue = report.issues.find(i => i.code === 'UNEXPECTED_BLACK_SCREEN');
    assert.ok(blackIssue, 'Must detect UNEXPECTED_BLACK_SCREEN');
    assert.equal(blackIssue.severity, 'ERROR');
  });
});

test('detects freeze intervals on synthetic static test video', () => {
  // Generate 3s clip: 0.5s moving testsrc, 2.0s static color, 0.5s moving testsrc
  const freezeClip = path.join(work, 'freeze-test.mp4');
  const res = spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=s=320x240:d=0.5,fps=30',
    '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=2.0,fps=30',
    '-f', 'lavfi', '-i', 'testsrc=s=320x240:d=0.5,fps=30',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1[v]',
    '-map', '[v]',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    freezeClip
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0);

  const freezeIntervals = QA.detectFreezeFrames(freezeClip, 1.0, 3.0);
  assert.ok(freezeIntervals.length >= 1);
  assert.ok(freezeIntervals[0].duration >= 1.8);

  const reportPromise = QA.runQA({
    video: freezeClip,
    report: path.join(work, 'freeze-report.json'),
    contactSheet: path.join(work, 'freeze-sheet.png'),
    freezeThresh: 1.0,
    quiet: true
  });

  return reportPromise.then((report) => {
    const freezeIssue = report.issues.find(i => i.code === 'FREEZE_FRAME_INTERVAL');
    assert.ok(freezeIssue, 'Must detect FREEZE_FRAME_INTERVAL');
  });
});

test('validates caption timings and warns on overlapping speaker cues in plan', () => {
  const badPlan = {
    document: {
      story: {
        fps: 30,
        durationInFrames: 90,
        scenes: [{
          id: 'test-scene',
          startFrame: 0,
          endFrame: 90,
          shots: [{ id: 's1', startFrame: 0, endFrame: 90, type: 'establishing' }],
          cues: [
            { id: 'c1', speaker: 'arun', startFrame: 10, endFrame: 30, text: 'Hello', kind: 'dialogue' },
            { id: 'c2', speaker: 'arun', startFrame: 20, endFrame: 40, text: 'World', kind: 'dialogue' },
            { id: 'c3', startFrame: 50, endFrame: 40, text: 'Inverted', kind: 'caption' } // invalid
          ]
        }]
      }
    }
  };

  const videoInfo = {
    path: 'test.mp4',
    width: 720,
    height: 1280,
    fps: 30,
    frames: 90,
    duration: 3.0,
    codec: 'h264',
    isValid: true
  };
  const audioInfo = { present: false, expected: false };

  const res = QA.checkPlanContinuity({ doc: badPlan.document, story: badPlan.document.story, path: 'dummy.json' }, videoInfo, audioInfo);
  assert.ok(res.issues.some(i => i.code === 'INVALID_CAPTION_TIMING' && i.severity === 'ERROR'));
  assert.ok(res.issues.some(i => i.code === 'OVERLAPPING_SPEAKER_CAPTIONS' && i.severity === 'WARNING'));
});

test('rejects missing video path with clean diagnostic', async () => {
  await assert.rejects(
    QA.runQA({ video: 'out/non-existent-video.mp4', quiet: true }),
    (err) => err.diagnostic?.code === 'VIDEO_NOT_FOUND'
  );
});

test('detects EFFECT_NOT_FOCUSED when effect occurs in shot not focused on target', () => {
  const plan = {
    document: {
      story: {
        fps: 30,
        durationInFrames: 120,
        scenes: [{
          id: 'scene-effects',
          startFrame: 0,
          endFrame: 120,
          shots: [
            { id: 'shot-focus', startFrame: 0, endFrame: 60, type: 'objectFocus', subject: 'machine' },
            { id: 'shot-reaction', startFrame: 60, endFrame: 120, type: 'twoShot', subjects: ['actor1', 'actor2'] }
          ],
          effects: [
            { type: 'impactFlash', target: 'machine', startFrame: 30 }, // Focused in shot-focus -> OK
            { type: 'dustPuff', target: 'machine', startFrame: 70 }     // Unfocused in shot-reaction -> WARNING
          ]
        }]
      }
    }
  };

  const videoInfo = { path: 'dummy.mp4', width: 720, height: 1280, fps: 30, frames: 120, duration: 4.0, codec: 'h264', isValid: true };
  const audioInfo = { present: false, expected: false };

  const res = QA.checkPlanContinuity({ doc: plan.document, story: plan.document.story, path: 'dummy.json' }, videoInfo, audioInfo);
  const effectWarnings = res.issues.filter(i => i.code === 'EFFECT_NOT_FOCUSED');
  assert.equal(effectWarnings.length, 1);
  assert.equal(effectWarnings[0].frame, 70);
  assert.equal(effectWarnings[0].details.target, 'machine');
  assert.match(effectWarnings[0].message, /Extend shot 'shot-focus'/);
  assert.equal(res.checks.cinematicFraming.status, 'WARNING');
});

test('detects SPEAKER_NOT_IN_SHOT when speaker is absent from single-subject shot, but preserves reaction shots and voiceover', () => {
  const plan = {
    document: {
      story: {
        fps: 30,
        durationInFrames: 300,
        scenes: [{
          id: 'scene-dialogue',
          startFrame: 0,
          endFrame: 300,
          shots: [
            { id: 'shot-medium-a', startFrame: 0, endFrame: 100, type: 'medium', subject: 'actorA' },
            { id: 'shot-reaction-b', startFrame: 100, endFrame: 200, type: 'reaction', subject: 'actorB' },
            { id: 'shot-medium-b', startFrame: 200, endFrame: 300, type: 'medium', subject: 'actorB' }
          ],
          cues: [
            // Line 1: actorA speaks in shot-medium-a -> matches subject -> OK
            { id: 'c1', speaker: 'actorA', kind: 'dialogue', startFrame: 10, endFrame: 80, text: 'Hello' },
            // Line 2: actorA speaks in shot-reaction-b -> intentional reaction shot -> preserved, no warning!
            { id: 'c2', speaker: 'actorA', kind: 'dialogue', startFrame: 110, endFrame: 180, text: 'Look at me' },
            // Line 3: actorA speaks in shot-medium-b -> single-subject medium on actorB -> WARNING!
            { id: 'c3', speaker: 'actorA', kind: 'dialogue', startFrame: 210, endFrame: 280, text: 'Why is B on screen?' },
            // Line 4: narrator voiceover in shot-medium-b -> voiceover -> preserved, no warning!
            { id: 'c4', speaker: 'narrator', kind: 'caption', startFrame: 285, endFrame: 295, text: 'The end' }
          ]
        }]
      }
    }
  };

  const videoInfo = { path: 'dummy.mp4', width: 720, height: 1280, fps: 30, frames: 300, duration: 10.0, codec: 'h264', isValid: true };
  const audioInfo = { present: false, expected: false };

  const res = QA.checkPlanContinuity({ doc: plan.document, story: plan.document.story, path: 'dummy.json' }, videoInfo, audioInfo);
  const speakerWarnings = res.issues.filter(i => i.code === 'SPEAKER_NOT_IN_SHOT');
  assert.equal(speakerWarnings.length, 1);
  assert.equal(speakerWarnings[0].details.cueId, 'c3');
  assert.equal(speakerWarnings[0].details.speaker, 'actorA');
  assert.equal(speakerWarnings[0].details.shotSubject, 'actorB');
  assert.match(speakerWarnings[0].message, /focuses on 'actorB'/);
});

test('evaluates Phase 7E school-robot story against existing MP4 and detects cinematic framing notices without blocking', async () => {
  const videoPath = 'out/phase7e-school-robot.mp4';
  const planPath = 'examples/phase7e-school-robot.story.json';
  const reportPath = path.join(work, 'phase7e-school-robot-qa.json');
  const sheetPath = path.join(work, 'phase7e-school-robot-sheet.png');

  const report = await QA.runQA({
    video: videoPath,
    plan: planPath,
    report: reportPath,
    contactSheet: sheetPath,
    quiet: true
  });

  // Bitstream and technical checks remain PASSED
  assert.equal(report.checks.decodeIntegrity.status, 'PASSED');
  assert.equal(report.checks.blackFrames.status, 'PASSED');
  assert.equal(report.checks.freezeFrames.status, 'PASSED');
  assert.equal(report.checks.audioSync.status, 'PASSED');

  // Advisory notices are detected
  assert.equal(report.verdict, 'WARNINGS');
  assert.equal(report.checks.cinematicFraming.status, 'WARNING');

  const effectNotices = report.issues.filter(i => i.code === 'EFFECT_NOT_FOCUSED');
  assert.equal(effectNotices.length, 2, 'Must detect impactFlash and dustPuff starting at frame 550 during twoShot');

  const speakerNotices = report.issues.filter(i => i.code === 'SPEAKER_NOT_IN_SHOT');
  assert.equal(speakerNotices.length, 1, 'Must detect Ananya closing dialogue while camera is on Rohit medium shot');
  assert.equal(speakerNotices[0].details.cueId, 'c8-closing');
});
