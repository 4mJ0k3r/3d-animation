'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runAuthoredStory } = require('./story.cjs');
const { runQA } = require('./qa.cjs');

const root = path.resolve(__dirname, '..');

function fail(code, message) {
  const err = new Error(message);
  err.diagnostic = { code, message };
  throw err;
}

function inside(filePath) {
  const resolved = path.resolve(root, filePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    fail('WORKSPACE_PATH', 'Path must be inside workspace: ' + filePath);
  }
  return resolved;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function runProduce(options) {
  const startTime = Date.now();

  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    fail('PRODUCE_ARGUMENT', 'Pass a production options object');
  }

  const allowed = [
    'plan', 'output', 'report', 'contactSheet', 'contact-sheet',
    'verify', 'maxFrames', 'max-frames', 'freezeThresh', 'freeze-thresh',
    'blackThresh', 'black-thresh', 'skipQA', 'skip-qa', 'quiet', 'json'
  ];
  for (const k of Object.keys(options)) {
    if (!allowed.includes(k)) {
      fail('PRODUCE_ARGUMENT', 'Unsupported option: ' + k);
    }
  }

  if (!options.plan || typeof options.plan !== 'string') {
    fail('PRODUCE_ARGUMENT', 'Specify --plan=examples/name.story.json');
  }

  const planPath = inside(options.plan);
  if (!fs.existsSync(planPath)) {
    fail('PLAN_MISSING', 'Plan file not found: ' + options.plan);
  }

  const statPlan = fs.statSync(planPath);
  if (!statPlan.isFile() || statPlan.size > 256 * 1024) {
    fail('PLAN_FILE', 'Use a canonical JSON file <= 256 KiB inside the workspace');
  }

  const planStem = path.basename(planPath, path.extname(planPath)).replace(/\.story$/, '');
  const outStem = options.output ? path.basename(options.output, path.extname(options.output)) : planStem;
  const stem = outStem;
  const outDir = path.join(root, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const outputPath = inside(options.output ?? path.join('out', `${planStem}.mp4`));
  if (!outputPath.startsWith(outDir + path.sep) || !outputPath.endsWith('.mp4')) {
    fail('OUTPUT_PATH', 'Output must be an .mp4 file under out/');
  }

  const reportPath = inside(options.report ?? path.join('out', `${stem}-production-report.json`));
  if (!reportPath.startsWith(outDir + path.sep) || !reportPath.endsWith('.json')) {
    fail('OUTPUT_PATH', 'Report must be a .json file under out/');
  }

  const csArg = options.contactSheet ?? options['contact-sheet'];
  const contactSheetPath = inside(csArg ?? path.join('out', `${stem}-contact-sheet.png`));

  const renderReportPath = path.join(path.dirname(outputPath), `${path.basename(outputPath, '.mp4')}-render-report.json`);
  const qaReportPath = path.join(path.dirname(outputPath), `${path.basename(outputPath, '.mp4')}-qa-report.json`);

  // STEP 1: Fast Story Validation (Schema, asset paths, font sha256, layout bounds)
  const validationStart = Date.now();
  const validationResult = await runAuthoredStory({
    command: 'validate',
    plan: planPath
  });
  const validationMs = Date.now() - validationStart;

  // STEP 2 & 3: Whole-Story Preparation & Guarded Production Rendering
  // runAuthoredStory handles preflight validation, concurrency 1, segment caching, and memory admission.
  const renderStart = Date.now();
  const verifyFlag = options.verify === true || options.verify === 'true';
  const renderResult = await runAuthoredStory({
    command: 'render',
    plan: planPath,
    output: outputPath,
    report: renderReportPath,
    verify: verifyFlag
  });
  const renderMs = Date.now() - renderStart;

  // STEP 4: Output Verification
  if (!fs.existsSync(outputPath)) {
    fail('OUTPUT_VERIFICATION_FAILED', 'Render completed but output file does not exist: ' + outputPath);
  }
  const statVideo = fs.statSync(outputPath);
  if (!statVideo.isFile() || statVideo.size === 0) {
    fail('OUTPUT_VERIFICATION_FAILED', 'Output video file is empty: ' + outputPath);
  }

  // STEP 5: Phase 7C Automated Visual QA & Contact Sheet Generation
  const skipQA = options.skipQA === true || options['skip-qa'] === true;
  let qaResult = null;
  let qaMs = 0;
  if (!skipQA) {
    const qaStart = Date.now();
    qaResult = await runQA({
      video: outputPath,
      plan: planPath,
      report: qaReportPath,
      contactSheet: contactSheetPath,
      maxFrames: options.maxFrames ?? options['max-frames'],
      freezeThresh: options.freezeThresh ?? options['freeze-thresh'],
      blackThresh: options.blackThresh ?? options['black-thresh'],
      quiet: true
    });
    qaMs = Date.now() - qaStart;
  }

  // STEP 6: Assemble Final Production Report
  const totalMs = Date.now() - startTime;
  let status = 'SUCCESS';
  if (qaResult) {
    if (qaResult.verdict === 'FAILED') status = 'FAILED';
    else if (qaResult.verdict === 'WARNINGS') status = 'WARNINGS';
  }

  let technicalGuidance = 'Objective checks NOT EVALUATED: QA stage skipped via --skip-qa.';
  let narrativeGuidance = 'Timeline continuity not evaluated.';
  if (qaResult) {
    if (qaResult.verdict === 'FAILED') {
      const errorCodes = qaResult.issues.filter(i => i.severity === 'ERROR').map(i => i.code);
      technicalGuidance = `Objective checks FAILED: technical defects detected (${errorCodes.join(', ')}). See QA report for details.`;
    } else if (qaResult.verdict === 'WARNINGS') {
      const warnCodes = qaResult.issues.filter(i => i.severity === 'WARNING').map(i => i.code);
      technicalGuidance = `Objective checks PASSED with warnings: advisory findings detected (${warnCodes.join(', ') || 'review QA report'}). Bitstream intact.`;
    } else {
      technicalGuidance = 'Objective checks PASSED: container and bitstream decoded without corruption, audio stream aligned, no unintended black screens or renderer freezes.';
    }

    if (qaResult.checks?.storyContinuity?.status === 'FAILED') {
      narrativeGuidance = `Timeline continuity FAILED: ${qaResult.checks.storyContinuity.message}`;
    } else if (qaResult.checks?.storyContinuity?.status === 'WARNING' || qaResult.checks?.cinematicFraming?.status === 'WARNING') {
      const notices = [];
      if (qaResult.checks?.storyContinuity?.status === 'WARNING') notices.push(qaResult.checks.storyContinuity.message);
      if (qaResult.checks?.cinematicFraming?.status === 'WARNING') notices.push(qaResult.checks.cinematicFraming.message);
      narrativeGuidance = `Timeline continuity and framing PASSED with notices: ${notices.join('; ')}`;
    } else if (qaResult.checks?.storyContinuity?.status === 'PASSED') {
      narrativeGuidance = 'Narrative pacing and caption intervals match authored specifications.';
    }
  }

  const productionReport = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    status,
    plan: {
      path: planPath,
      title: validationResult.title || stem,
      scenes: validationResult.segments?.length || 1,
      frames: validationResult.frames,
      fps: validationResult.fps,
      video: validationResult.video
    },
    output: {
      path: outputPath,
      sizeBytes: statVideo.size,
      frames: qaResult?.video?.frames || validationResult.frames,
      duration: qaResult?.video?.duration || (validationResult.frames / (validationResult.fps || 30)),
      codec: qaResult?.video?.codec || 'h264'
    },
    render: {
      segmented: renderResult.segmented,
      manifest: renderResult.manifest,
      segments: renderResult.segments,
      reportPath: renderReportPath
    },
    qa: qaResult ? {
      verdict: qaResult.verdict,
      reportPath: qaReportPath,
      checks: qaResult.checks,
      issues: qaResult.issues
    } : undefined,
    contactSheet: qaResult?.contactSheet ? {
      path: contactSheetPath,
      totalFramesSampled: qaResult.contactSheet.totalFramesSampled,
      grid: qaResult.contactSheet.grid
    } : undefined,
    timing: {
      validationMs,
      renderMs,
      qaMs,
      totalMs
    },
    guidance: {
      technicalIntegrity: technicalGuidance,
      narrativeContinuity: narrativeGuidance,
      visualReviewRequired: 'Artistic quality, character expressions, silhouette appeal, and aesthetic staging require visual review of the contact sheet or final MP4.'
    }
  };

  fs.writeFileSync(reportPath, JSON.stringify(productionReport, null, 2));

  // STEP 7: Print Human/Agent Actionable Summary
  if (!options.quiet) {
    printProductionConsole(productionReport, reportPath, contactSheetPath, skipQA);
  }

  return productionReport;
}

function printProductionConsole(report, reportPath, contactSheetPath, skipQA) {
  const vColor = report.status === 'SUCCESS' ? '\x1b[32m' : (report.status === 'WARNINGS' ? '\x1b[33m' : '\x1b[31m');
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';

  console.log(`\n${bold}================================================================${reset}`);
  console.log(`${bold} TOON-KIT ONE-SHOT PRODUCTION — ${vColor}${report.status}${reset}`);
  console.log(`${bold}================================================================${reset}`);
  console.log(`Input Plan:    ${report.plan.path}`);
  console.log(`Final Video:   ${report.output.path} (${report.plan.video?.width || 720}x${report.plan.video?.height || 1280} @ ${report.plan.fps}fps | ${report.output.frames} frames | ${report.output.duration.toFixed(2)}s | ${formatBytes(report.output.sizeBytes)})`);
  console.log(`Render Report: ${report.render.reportPath}`);

  if (report.qa) {
    const qColor = report.qa.verdict === 'PASSED' ? '\x1b[32m[PASSED]' : (report.qa.verdict === 'WARNINGS' ? '\x1b[33m[WARNINGS]' : '\x1b[31m[FAILED]');
    console.log(`QA Report:     ${report.qa.reportPath} ${qColor}${reset}`);
    console.log(`Contact Sheet: ${contactSheetPath} (${report.contactSheet?.totalFramesSampled || 0} frames sampled, ${report.contactSheet?.grid || '4x4'} grid)`);
  } else if (skipQA) {
    console.log(`QA Stage:      Skipped via --skip-qa`);
  }

  console.log(`Timing:        Validation: ${(report.timing.validationMs / 1000).toFixed(2)}s | Render: ${(report.timing.renderMs / 1000).toFixed(2)}s | QA: ${(report.timing.qaMs / 1000).toFixed(2)}s | Total: ${(report.timing.totalMs / 1000).toFixed(2)}s`);

  if (report.qa?.checks) {
    console.log(`----------------------------------------------------------------`);
    console.log(`${bold}Automated Verification:${reset}`);
    for (const [key, chk] of Object.entries(report.qa.checks)) {
      const sColor = chk.status === 'PASSED' ? '\x1b[32m[PASS]' : (chk.status === 'WARNING' ? '\x1b[33m[WARN]' : (chk.status === 'FAILED' ? '\x1b[31m[FAIL]' : '\x1b[90m[SKIP]'));
      console.log(`  ${sColor}${reset} ${key.padEnd(16)}: ${chk.message}`);
    }
  }

  if (report.qa?.issues && report.qa.issues.length > 0) {
    console.log(`----------------------------------------------------------------`);
    console.log(`${bold}Findings & Issues (${report.qa.issues.length}):${reset}`);
    for (const iss of report.qa.issues) {
      const iColor = iss.severity === 'ERROR' ? '\x1b[31mERROR  ' : (iss.severity === 'WARNING' ? '\x1b[33mWARNING' : '\x1b[36mINFO   ');
      const loc = iss.frame !== undefined ? ` [F#${iss.frame}]` : (iss.scene ? ` [${iss.scene}]` : '');
      console.log(`  ${iColor}${reset} [${iss.code}]${loc}: ${iss.message}`);
    }
  }

  console.log(`----------------------------------------------------------------`);
  console.log(`${bold}Review Guidance:${reset}`);
  console.log(`  * Technical Integrity: ${report.guidance.technicalIntegrity}`);
  console.log(`  * Narrative Bounds:   ${report.guidance.narrativeContinuity}`);
  console.log(`  * Visual / Artistic:  \x1b[1mREQUIRES AGENT/HUMAN INSPECTION.\x1b[0m`);
  console.log(`    Inspect the contact sheet: ${contactSheetPath}`);
  console.log(`Production Report: ${reportPath}`);
  console.log(`${bold}================================================================${reset}\n`);
}

function parseCliArgs(argv) {
  const options = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        if (key === 'plan') options.plan = val;
        else if (key === 'output') options.output = val;
        else if (key === 'report') options.report = val;
        else if (key === 'contact-sheet' || key === 'contactSheet') options.contactSheet = val;
        else if (key === 'verify') options.verify = val === 'true';
        else if (key === 'max-frames' || key === 'maxFrames') options.maxFrames = Number(val);
        else if (key === 'freeze-thresh' || key === 'freezeThresh') options.freezeThresh = Number(val);
        else if (key === 'black-thresh' || key === 'blackThresh') options.blackThresh = Number(val);
      } else {
        const flag = arg.slice(2);
        if (flag === 'quiet') options.quiet = true;
        else if (flag === 'json') options.json = true;
        else if (flag === 'skip-qa' || flag === 'skipQA') options.skipQA = true;
      }
    }
  }
  return options;
}

if (require.main === module) {
  try {
    const options = parseCliArgs(process.argv);
    if (!options.plan) {
      console.error('Usage: npm run produce -- --plan=examples/name.story.json [--output=out/final.mp4] [--report=out/prod-report.json]');
      process.exit(1);
    }
    runProduce(options).then((report) => {
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      }
      process.exit(report.status === 'FAILED' ? 1 : 0);
    }).catch((err) => {
      console.error('\x1b[31mProduction Fatal Error:\x1b[0m', err.diagnostic || err.message);
      process.exit(1);
    });
  } catch (err) {
    console.error('\x1b[31mProduction Fatal Error:\x1b[0m', err.diagnostic || err.message);
    process.exit(1);
  }
}

module.exports = {
  runProduce
};
