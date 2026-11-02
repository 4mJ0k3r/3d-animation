'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function fail(code, message) {
  const err = new Error(message);
  err.diagnostic = { code, message };
  throw err;
}

function inside(filePath, allowOutside = false) {
  const resolved = path.resolve(root, filePath);
  if (!allowOutside && !resolved.startsWith(root + path.sep) && resolved !== root) {
    fail('WORKSPACE_PATH', 'Path must be inside workspace: ' + filePath);
  }
  return resolved;
}

function escapeDrawtext(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

function formatTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

function runFFprobe(videoPath) {
  const res = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,duration,nb_frames,bit_rate,channels,sample_rate,pix_fmt',
    '-show_entries', 'format=duration,size,bit_rate',
    '-of', 'json',
    videoPath
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

  if (res.error) {
    fail('FFPROBE_ERROR', 'Failed to execute ffprobe: ' + res.error.message);
  }
  if (res.status !== 0) {
    fail('PROBE_FAILED', 'ffprobe failed on ' + videoPath + ': ' + (res.stderr || 'unknown error'));
  }

  try {
    return JSON.parse(res.stdout);
  } catch (err) {
    fail('PROBE_PARSE_ERROR', 'Failed to parse ffprobe json output: ' + err.message);
  }
}

function parseRate(rateStr) {
  if (!rateStr || typeof rateStr !== 'string') return 30;
  const parts = rateStr.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (den > 0) return Math.round((num / den) * 100) / 100;
  }
  const direct = Number(rateStr);
  return isNaN(direct) ? 30 : direct;
}

function probeVideoProperties(probeData, videoPath) {
  const streams = probeData.streams || [];
  const videoStream = streams.find(s => s.codec_type === 'video');
  if (!videoStream) {
    fail('NO_VIDEO_STREAM', 'No video stream found in container: ' + videoPath);
  }

  const fps = parseRate(videoStream.r_frame_rate || videoStream.avg_frame_rate || '30/1');
  const duration = parseFloat(videoStream.duration || probeData.format?.duration || '0');
  let frames = parseInt(videoStream.nb_frames, 10);
  if (isNaN(frames) || frames <= 0) {
    frames = Math.round(duration * fps);
  }

  const audioStream = streams.find(s => s.codec_type === 'audio');
  const audioInfo = {
    present: !!audioStream,
    expected: false,
    codec: audioStream?.codec_name || null,
    channels: audioStream?.channels || 0,
    sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : null,
    duration: audioStream?.duration ? parseFloat(audioStream.duration) : (audioStream ? duration : null),
    bitRate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate, 10) : null
  };

  const videoInfo = {
    path: videoPath,
    width: videoStream.width || 0,
    height: videoStream.height || 0,
    fps,
    frames,
    duration,
    codec: videoStream.codec_name || 'unknown',
    pixFmt: videoStream.pix_fmt || 'unknown',
    bitRate: parseInt(videoStream.bit_rate || probeData.format?.bit_rate || '0', 10),
    isValid: true
  };

  return { videoInfo, audioInfo };
}

function checkDecodeIntegrity(videoPath) {
  const res = spawnSync('ffmpeg', [
    '-v', 'error',
    '-i', videoPath,
    '-f', 'null',
    '-'
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

  const stderr = (res.stderr || '').trim();
  const isValid = res.status === 0 && (!stderr || !/error|invalid|corrupt/i.test(stderr));

  return {
    isValid,
    stderr: stderr || undefined
  };
}

function detectBlackFrames(videoPath, blackThresh = 0.2) {
  const res = spawnSync('ffmpeg', [
    '-i', videoPath,
    '-vf', `blackdetect=d=${blackThresh}:pic_th=0.98:pix_th=0.10`,
    '-f', 'null',
    '-'
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

  const stderr = res.stderr || '';
  const intervals = [];
  const regex = /black_start:(?<start>[\d.]+)\s+black_end:(?<end>[\d.]+)\s+black_duration:(?<duration>[\d.]+)/g;
  let match;
  while ((match = regex.exec(stderr)) !== null) {
    intervals.push({
      start: parseFloat(match.groups.start),
      end: parseFloat(match.groups.end),
      duration: parseFloat(match.groups.duration)
    });
  }

  return intervals;
}

function detectFreezeFrames(videoPath, freezeThresh = 1.0, videoDuration = 0) {
  const res = spawnSync('ffmpeg', [
    '-i', videoPath,
    '-vf', `freezedetect=noise=-60dB:d=${freezeThresh}`,
    '-f', 'null',
    '-'
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

  const stderr = res.stderr || '';
  const intervals = [];
  const lines = stderr.split('\n');
  let currentStart = null;

  for (const line of lines) {
    const startMatch = line.match(/lavfi\.freezedetect\.freeze_start:\s*([\d.]+)/);
    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/lavfi\.freezedetect\.freeze_end:\s*([\d.]+)/);
    const durMatch = line.match(/lavfi\.freezedetect\.freeze_duration:\s*([\d.]+)/);
    if (endMatch && currentStart !== null) {
      const end = parseFloat(endMatch[1]);
      const duration = durMatch ? parseFloat(durMatch[1]) : (end - currentStart);
      intervals.push({ start: currentStart, end, duration });
      currentStart = null;
    }
  }

  if (currentStart !== null && videoDuration > currentStart) {
    intervals.push({
      start: currentStart,
      end: videoDuration,
      duration: videoDuration - currentStart
    });
  }

  return intervals;
}

function loadStoryPlan(planPath) {
  const fullPath = inside(planPath);
  if (!fs.existsSync(fullPath)) {
    fail('PLAN_MISSING', 'Story plan file not found: ' + planPath);
  }
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const parsed = JSON.parse(content);
    // Unpack if wrapped in document or story
    const doc = parsed.document || parsed;
    const story = doc.story || doc;
    return { doc, story, raw: parsed, path: fullPath };
  } catch (err) {
    fail('PLAN_PARSE_ERROR', 'Failed to parse story plan JSON: ' + err.message);
  }
}

function checkPlanContinuity(storyData, videoInfo, audioInfo) {
  const issues = [];
  const checks = {};
  const { doc, story, path: planPath } = storyData;

  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  const expectedFps = story.fps || doc.fps || 30;
  const expectedWidth = doc.video?.width || 720;
  const expectedHeight = doc.video?.height || 1280;

  let expectedFrames = story.durationInFrames || doc.durationInFrames;
  if (!expectedFrames && scenes.length > 0) {
    const lastScene = scenes[scenes.length - 1];
    expectedFrames = lastScene.endFrame || 0;
  }

  // Audio plan check
  const hasAudioPlan = !!(story.audio || doc.audio || scenes.some(s => s.cues?.some(c => c.kind === 'dialogue' && c.alignmentId)));
  audioInfo.expected = hasAudioPlan;

  // 1. Dimensions check
  if (videoInfo.width !== expectedWidth || videoInfo.height !== expectedHeight) {
    issues.push({
      severity: 'ERROR',
      code: 'DIMENSION_MISMATCH',
      message: `Video dimensions (${videoInfo.width}x${videoInfo.height}) do not match plan expectation (${expectedWidth}x${expectedHeight})`
    });
    checks.dimensions = {
      status: 'FAILED',
      message: `Expected ${expectedWidth}x${expectedHeight}, got ${videoInfo.width}x${videoInfo.height}`
    };
  } else {
    checks.dimensions = {
      status: 'PASSED',
      message: `Dimensions match plan (${expectedWidth}x${expectedHeight})`
    };
  }

  // 2. FPS check
  if (Math.abs(videoInfo.fps - expectedFps) > 0.1) {
    issues.push({
      severity: 'ERROR',
      code: 'FPS_MISMATCH',
      message: `Video frame rate (${videoInfo.fps} fps) does not match plan expectation (${expectedFps} fps)`
    });
    checks.fps = {
      status: 'FAILED',
      message: `Expected ${expectedFps} fps, got ${videoInfo.fps} fps`
    };
  } else {
    checks.fps = {
      status: 'PASSED',
      message: `Frame rate matches plan (${expectedFps} fps)`
    };
  }

  // 3. Frame count check
  if (expectedFrames && Math.abs(videoInfo.frames - expectedFrames) > 1) {
    issues.push({
      severity: 'ERROR',
      code: 'FRAME_COUNT_MISMATCH',
      message: `Video frame count (${videoInfo.frames}) does not match plan expectation (${expectedFrames} frames)`
    });
    checks.frameCount = {
      status: 'FAILED',
      message: `Expected ${expectedFrames} frames, got ${videoInfo.frames} frames`
    };
  } else {
    checks.frameCount = {
      status: 'PASSED',
      message: `Frame count matches plan (${expectedFrames || videoInfo.frames} frames)`
    };
  }

  // 4. Audio sync check
  if (hasAudioPlan) {
    if (!audioInfo.present) {
      issues.push({
        severity: 'ERROR',
        code: 'MISSING_AUDIO_STREAM',
        message: 'Story plan specifies audio cues/tracks, but MP4 container has no audio stream'
      });
      checks.audioSync = {
        status: 'FAILED',
        message: 'Audio stream missing from container despite audio plan'
      };
    } else {
      const diff = Math.abs((audioInfo.duration || videoInfo.duration) - videoInfo.duration);
      if (diff > 0.5) {
        issues.push({
          severity: 'WARNING',
          code: 'AUDIO_DURATION_DRIFT',
          message: `Audio duration (${audioInfo.duration}s) drifts from video duration (${videoInfo.duration}s) by ${diff.toFixed(2)}s`
        });
        checks.audioSync = {
          status: 'WARNING',
          message: `Audio duration drift of ${diff.toFixed(2)}s`
        };
      } else {
        checks.audioSync = {
          status: 'PASSED',
          message: `Audio stream present and duration matches video (${audioInfo.duration?.toFixed(2)}s)`
        };
      }
    }
  } else {
    if (audioInfo.present) {
      issues.push({
        severity: 'INFO',
        code: 'AUDIO_STREAM_PRESENT',
        message: 'Audio stream present in container (story plan did not specify explicit audio)'
      });
      checks.audioSync = {
        status: 'PASSED',
        message: 'Audio stream present'
      };
    } else {
      issues.push({
        severity: 'INFO',
        code: 'SILENT_VIDEO_AS_PLANNED',
        message: 'Story plan is silent and MP4 has no audio stream as planned'
      });
      checks.audioSync = {
        status: 'PASSED',
        message: 'Silent video as planned'
      };
    }
  }

  // 5. Scene & Shot continuity
  let previousSceneEnd = 0;
  let totalShots = 0;
  let sceneContinuityIssues = 0;

  for (let sIdx = 0; sIdx < scenes.length; sIdx++) {
    const scene = scenes[sIdx];
    const sceneId = scene.id || `scene-${sIdx + 1}`;
    const sStart = scene.startFrame ?? previousSceneEnd;
    const sEnd = scene.endFrame;

    if (sStart !== previousSceneEnd && sIdx > 0) {
      if (sStart > previousSceneEnd) {
        issues.push({
          severity: 'WARNING',
          code: 'TIMELINE_GAP',
          message: `Timeline gap between scene ${scenes[sIdx - 1].id} (end ${previousSceneEnd}) and ${sceneId} (start ${sStart})`,
          scene: sceneId,
          frame: sStart
        });
        sceneContinuityIssues++;
      } else {
        issues.push({
          severity: 'ERROR',
          code: 'TIMELINE_OVERLAP',
          message: `Timeline overlap between scene ${scenes[sIdx - 1].id} (end ${previousSceneEnd}) and ${sceneId} (start ${sStart})`,
          scene: sceneId,
          frame: sStart
        });
        sceneContinuityIssues++;
      }
    }
    if (sEnd !== undefined) {
      previousSceneEnd = sEnd;
    }

    // Shots
    const shots = Array.isArray(scene.shots) ? scene.shots : [];
    totalShots += shots.length;
    for (const shot of shots) {
      const shotDur = (shot.endFrame || 0) - (shot.startFrame || 0);
      if (shotDur > 0 && shotDur < 10) {
        issues.push({
          severity: 'WARNING',
          code: 'RAPID_CUT',
          message: `Shot ${shot.id || 'unnamed'} in ${sceneId} is very short (${shotDur} frames / ${(shotDur / expectedFps).toFixed(2)}s)`,
          scene: sceneId,
          shot: shot.id,
          frame: shot.startFrame
        });
        sceneContinuityIssues++;
      }
    }

    // Cues
    const cues = Array.isArray(scene.cues) ? scene.cues : [];
    const speakerCues = new Map();
    for (const cue of cues) {
      const cStart = cue.startFrame;
      const cEnd = cue.endFrame;
      if (cStart >= cEnd) {
        issues.push({
          severity: 'ERROR',
          code: 'INVALID_CAPTION_TIMING',
          message: `Cue ${cue.id || 'unnamed'} has invalid timing: startFrame (${cStart}) >= endFrame (${cEnd})`,
          scene: sceneId,
          frame: cStart
        });
      }
      if (sEnd !== undefined && (cStart < sStart || cEnd > sEnd)) {
        issues.push({
          severity: 'WARNING',
          code: 'CAPTION_OUT_OF_SCENE_BOUNDS',
          message: `Cue ${cue.id || 'unnamed'} [${cStart}, ${cEnd}] exceeds scene bounds [${sStart}, ${sEnd}]`,
          scene: sceneId,
          frame: cStart
        });
      }
      if (!cue.text || typeof cue.text !== 'string' || cue.text.trim().length === 0) {
        issues.push({
          severity: 'WARNING',
          code: 'EMPTY_CAPTION_TEXT',
          message: `Cue ${cue.id || 'unnamed'} has empty caption text`,
          scene: sceneId,
          frame: cStart
        });
      }

      // Overlap per speaker
      if (cue.speaker) {
        if (!speakerCues.has(cue.speaker)) speakerCues.set(cue.speaker, []);
        for (const existing of speakerCues.get(cue.speaker)) {
          if (Math.max(cStart, existing.start) < Math.min(cEnd, existing.end)) {
            issues.push({
              severity: 'WARNING',
              code: 'OVERLAPPING_SPEAKER_CAPTIONS',
              message: `Overlapping caption cues for speaker '${cue.speaker}' in ${sceneId}: cue ${cue.id} overlaps with ${existing.id}`,
              scene: sceneId,
              frame: cStart
            });
          }
        }
        speakerCues.get(cue.speaker).push({ start: cStart, end: cEnd, id: cue.id });
      }
    }

    // Effect visibility check: detect effects occurring in shots not clearly focused on their target
    const effects = Array.isArray(scene.effects) ? scene.effects : [];
    for (const effect of effects) {
      const eStart = effect.startFrame;
      const target = effect.target;
      const activeShot = shots.find(s => s.startFrame <= eStart && s.endFrame > eStart);
      const isFocused = activeShot && activeShot.type === 'objectFocus' && activeShot.subject === target;

      if (!isFocused) {
        const prevShot = shots.slice().reverse().find(s => s.type === 'objectFocus' && s.subject === target && s.endFrame <= eStart);
        const fix = prevShot
          ? `Extend shot '${prevShot.id}' (objectFocus on '${target}') to cover frame ${eStart}, or cut to an objectFocus shot of '${target}' during the effect, or align effect startFrame with the focused shot.`
          : `Cut to an 'objectFocus' shot targeting '${target}' around frame ${eStart}, or widen framing so '${target}' is visibly centered during the effect.`;

        issues.push({
          severity: 'WARNING',
          code: 'EFFECT_NOT_FOCUSED',
          message: `Effect '${effect.type}' at frame ${eStart} targets '${target}', but active shot '${activeShot?.id || 'none'}' (${activeShot?.type || 'unknown'}) is not focused on '${target}'. Suggested fix: ${fix} If this is an intentional background/off-camera effect or reaction shot, review and accept this advisory warning.`,
          scene: sceneId,
          shot: activeShot?.id,
          frame: eStart,
          details: {
            effectType: effect.type,
            target,
            startFrame: eStart,
            activeShot: activeShot?.id,
            activeShotType: activeShot?.type,
            activeShotSubject: activeShot?.subject || activeShot?.subjects,
            suggestedFix: fix
          }
        });
        sceneContinuityIssues++;
      }
    }

    // Dialogue speaker visibility check: detect dialogue cues where speaker is absent from single-subject shot
    for (const cue of cues) {
      if (cue.kind === 'caption' || cue.mode === 'voiceover' || cue.voiceover === true || cue.speaker === 'narrator' || !cue.speaker) {
        continue;
      }
      const speaker = cue.speaker;
      const cStart = cue.startFrame;
      const cEnd = cue.endFrame;
      const cDuration = cEnd - cStart;
      if (cDuration <= 0) continue;

      for (const shot of shots) {
        const overlap = Math.max(0, Math.min(cEnd, shot.endFrame) - Math.max(cStart, shot.startFrame));
        if (overlap <= 0 || (overlap / cDuration) <= 0.5) continue;

        // Preserve intentional reaction shots
        if (shot.type === 'reaction' || /\breact(ion)?\b/i.test(shot.id || '')) {
          continue;
        }

        // Single-subject actor shots: medium, closeUp, fullBody, cowboy
        const isSingleActorShot = ['medium', 'closeUp', 'fullBody', 'cowboy'].includes(shot.type);
        if (isSingleActorShot && shot.subject && shot.subject !== speaker) {
          const fix = `Cut to a shot of '${speaker}', switch to a twoShot including '${speaker}', or if this is an intentional reaction shot or voiceover, use shot type 'reaction' or mark the cue as voiceover.`;
          issues.push({
            severity: 'WARNING',
            code: 'SPEAKER_NOT_IN_SHOT',
            message: `Dialogue cue '${cue.id || 'unnamed'}' in ${sceneId} [${cStart}, ${cEnd}] is spoken by '${speaker}', but active shot '${shot.id || 'unnamed'}' (${shot.type}) focuses on '${shot.subject}' for ${Math.round((overlap / cDuration) * 100)}% of the line. Suggested fix: ${fix}`,
            scene: sceneId,
            shot: shot.id,
            frame: cStart,
            details: {
              cueId: cue.id,
              speaker,
              startFrame: cStart,
              endFrame: cEnd,
              shotId: shot.id,
              shotType: shot.type,
              shotSubject: shot.subject,
              overlapFrames: overlap,
              cueFrames: cDuration,
              overlapFraction: Math.round((overlap / cDuration) * 100) / 100,
              suggestedFix: fix
            }
          });
          sceneContinuityIssues++;
        }
      }
    }
  }

  const cinematicNotices = issues.filter(i => (i.code === 'EFFECT_NOT_FOCUSED' || i.code === 'SPEAKER_NOT_IN_SHOT') && i.scene);
  checks.cinematicFraming = {
    status: cinematicNotices.length > 0 ? 'WARNING' : 'PASSED',
    message: cinematicNotices.length === 0
      ? 'Effects and dialogue cues align with camera shot subjects'
      : `${cinematicNotices.length} cinematic framing advisory notice(s) detected`,
    details: { notices: cinematicNotices }
  };

  checks.storyContinuity = {
    status: sceneContinuityIssues > 0 ? (issues.some(i => i.severity === 'ERROR' && i.scene) ? 'FAILED' : 'WARNING') : 'PASSED',
    message: sceneContinuityIssues === 0 ? 'Scenes, shots, and caption intervals are contiguous and valid' : `${sceneContinuityIssues} continuity notice(s) detected`
  };

  const planInfo = {
    path: planPath,
    evaluated: true,
    title: doc.title || story.title || path.basename(planPath, '.story.json'),
    totalScenes: scenes.length,
    totalShots,
    expectedFrames,
    expectedFps,
    expectedWidth,
    expectedHeight,
    hasAudio: hasAudioPlan
  };

  return { planInfo, issues, checks };
}

function selectSampledFrames(videoInfo, storyData, blackIntervals, freezeIntervals, maxFrames = 16) {
  const fps = videoInfo.fps;
  const totalFrames = videoInfo.frames;
  const candidates = [];

  function addCandidate(frame, label, type, sceneId, shotId) {
    const f = Math.max(0, Math.min(totalFrames - 1, Math.round(frame)));
    candidates.push({
      frame: f,
      timestamp: Math.round((f / fps) * 100) / 100,
      label,
      type,
      sceneId,
      shotId
    });
  }

  // 1. Start frame
  addCandidate(0, 'Opening frame', 'START', undefined, undefined);

  // 2. Story scene and shot points if plan available
  if (storyData && storyData.story?.scenes) {
    for (const scene of storyData.story.scenes) {
      const sId = scene.id || 'scene';
      if (scene.startFrame > 0 && scene.startFrame < totalFrames) {
        addCandidate(scene.startFrame, `${sId} Cut`, 'CUT', sId, undefined);
      }
      if (Array.isArray(scene.shots)) {
        for (const shot of scene.shots) {
          const shStart = shot.startFrame || 0;
          const shEnd = shot.endFrame || shStart;
          if (shStart > 0 && shStart < totalFrames && shStart !== scene.startFrame) {
            addCandidate(shStart, `${sId}:${shot.id || 'shot'} Cut`, 'CUT', sId, shot.id);
          }
          const mid = Math.floor((shStart + shEnd) / 2);
          if (mid > 0 && mid < totalFrames) {
            const tag = shot.type === 'objectFocus' ? 'OBJ' : (shot.type === 'establishing' ? 'EST' : 'MID');
            addCandidate(mid, `${sId}:${shot.id || 'shot'} (${tag})`, 'MID', sId, shot.id);
          }
        }
      }
    }
  }

  // 3. Anomaly frames from black/freeze
  for (const b of blackIntervals) {
    if (b.duration > 0.4) {
      const midTime = (b.start + b.end) / 2;
      const f = Math.round(midTime * fps);
      addCandidate(f, `Black frame interval (${b.duration.toFixed(2)}s)`, 'ANOMALY', undefined, undefined);
    }
  }
  for (const fr of freezeIntervals) {
    if (fr.duration > 1.2) {
      const midTime = (fr.start + fr.end) / 2;
      const f = Math.round(midTime * fps);
      addCandidate(f, `Freeze frame interval (${fr.duration.toFixed(2)}s)`, 'ANOMALY', undefined, undefined);
    }
  }

  // 4. End frame
  addCandidate(totalFrames - 1, 'Final frame', 'END', undefined, undefined);

  // Deduplicate candidates by frame distance
  candidates.sort((a, b) => a.frame - b.frame);
  const deduped = [];
  for (const c of candidates) {
    if (deduped.length === 0) {
      deduped.push(c);
    } else {
      const prev = deduped[deduped.length - 1];
      if (c.frame - prev.frame >= 4) {
        deduped.push(c);
      } else if (c.type === 'ANOMALY' || c.type === 'CUT') {
        deduped[deduped.length - 1] = c;
      }
    }
  }

  // Ensure target count matches grid multiple of 4 (clamp maxFrames between 8 and 24)
  const targetCount = Math.max(8, Math.min(24, Math.round(maxFrames / 4) * 4));

  let finalFrames = [...deduped];

  // If too many, prune while keeping START, END, ANOMALY, and CUTs
  if (finalFrames.length > targetCount) {
    const essential = finalFrames.filter(f => f.type === 'START' || f.type === 'END' || f.type === 'ANOMALY');
    const nonEssential = finalFrames.filter(f => f.type !== 'START' && f.type !== 'END' && f.type !== 'ANOMALY');
    const needed = targetCount - essential.length;
    if (needed > 0 && nonEssential.length > 0) {
      const step = nonEssential.length / needed;
      const selectedNonEssential = [];
      for (let i = 0; i < needed; i++) {
        selectedNonEssential.push(nonEssential[Math.floor(i * step)]);
      }
      finalFrames = [...essential, ...selectedNonEssential].sort((a, b) => a.frame - b.frame);
    } else {
      finalFrames = essential.slice(0, targetCount);
    }
  }

  // If too few, interpolate evenly
  while (finalFrames.length < targetCount) {
    let largestGapIdx = 0;
    let largestGap = 0;
    for (let i = 0; i < finalFrames.length - 1; i++) {
      const gap = finalFrames[i + 1].frame - finalFrames[i].frame;
      if (gap > largestGap) {
        largestGap = gap;
        largestGapIdx = i;
      }
    }
    if (largestGap < 4) break;
    const midFrame = Math.floor((finalFrames[largestGapIdx].frame + finalFrames[largestGapIdx + 1].frame) / 2);
    const midTime = Math.round((midFrame / fps) * 100) / 100;
    finalFrames.splice(largestGapIdx + 1, 0, {
      frame: midFrame,
      timestamp: midTime,
      label: `Frame #${midFrame} sample`,
      type: 'MID'
    });
  }

  // Fill up to exact targetCount if still short
  while (finalFrames.length < targetCount) {
    const last = finalFrames[finalFrames.length - 1];
    finalFrames.push({ ...last, label: last.label + ' (pad)' });
  }

  return finalFrames.slice(0, targetCount);
}

function generateContactSheet(videoPath, sampledFrames, outputPath, videoInfo) {
  const isVertical = videoInfo.height >= videoInfo.width;
  const tileW = isVertical ? 270 : 480;
  const tileH = isVertical ? 480 : 270;
  const cols = 4;
  const rows = Math.ceil(sampledFrames.length / cols);
  const sheetWidth = cols * tileW;
  const sheetHeight = rows * tileH;

  const tmpDir = path.join(root, '.remotion-tmp', `qa-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const fontCandidates = [
    path.join(root, 'public/fonts/noto-devanagari/NotoSansDevanagari.ttf'),
    path.join(root, 'public/fonts/NotoSansDevanagari.ttf')
  ];
  let fontPath = fontCandidates.find(f => fs.existsSync(f));
  let fontOpt = '';
  if (fontPath) {
    const safeFont = fontPath.replace(/\\/g, '/');
    fontOpt = `:fontfile='${safeFont}'`;
  }

  try {
    for (let i = 0; i < sampledFrames.length; i++) {
      const item = sampledFrames[i];
      const frameFile = path.join(tmpDir, `tile_${String(i).padStart(3, '0')}.png`);
      const timeStr = formatTime(item.timestamp);
      const labelText = `#${item.frame} (${timeStr}) | ${item.label}`;
      const escaped = escapeDrawtext(labelText);

      const vf = `scale=${tileW}:${tileH},drawtext=text='${escaped}'${fontOpt}:box=1:boxcolor=black@0.85:boxborderw=5:fontsize=13:fontcolor=white:x=10:y=10`;

      const res = spawnSync('ffmpeg', [
        '-ss', String(item.timestamp),
        '-i', videoPath,
        '-vf', vf,
        '-frames:v', '1',
        '-update', '1',
        '-y',
        frameFile
      ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

      if (res.status !== 0 || !fs.existsSync(frameFile)) {
        // Fallback without drawtext if font failed
        spawnSync('ffmpeg', [
          '-ss', String(item.timestamp),
          '-i', videoPath,
          '-vf', `scale=${tileW}:${tileH}`,
          '-frames:v', '1',
          '-update', '1',
          '-y',
          frameFile
        ], { encoding: 'utf8' });
      }
    }

    const tileInputPattern = path.join(tmpDir, 'tile_%03d.png');
    const tileRes = spawnSync('ffmpeg', [
      '-y',
      '-i', tileInputPattern,
      '-vf', `tile=${cols}x${rows}`,
      outputPath
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

    if (tileRes.status !== 0 || !fs.existsSync(outputPath)) {
      fail('CONTACT_SHEET_FAILED', 'Failed to composite contact sheet: ' + (tileRes.stderr || 'unknown error'));
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }

  return {
    path: outputPath,
    totalFramesSampled: sampledFrames.length,
    grid: `${cols}x${rows}`,
    tileWidth: tileW,
    tileHeight: tileH,
    sheetWidth,
    sheetHeight,
    sampledFrames
  };
}

function checkAdjacentReports(videoPath, inputReportPath) {
  const candidatePaths = [];
  if (inputReportPath) {
    candidatePaths.push(inside(inputReportPath, true));
  }
  const dir = path.dirname(videoPath);
  const stem = path.basename(videoPath, path.extname(videoPath));
  candidatePaths.push(path.join(dir, `${stem}-report.json`));
  candidatePaths.push(path.join(dir, `${stem}.report.json`));
  candidatePaths.push(path.join(root, 'out', `${stem}-report.json`));

  for (const c of candidatePaths) {
    if (fs.existsSync(c)) {
      try {
        const data = JSON.parse(fs.readFileSync(c, 'utf8'));
        return { path: c, data };
      } catch (_) {}
    }
  }
  return null;
}

async function runQA(options) {
  const startTime = Date.now();
  if (!options || typeof options !== 'object') {
    fail('QA_ARGUMENT', 'Pass an options object to runQA');
  }
  if (!options.video || typeof options.video !== 'string') {
    fail('QA_ARGUMENT', 'Specify --video=<path>');
  }

  const videoPath = inside(options.video, true);
  if (!fs.existsSync(videoPath)) {
    fail('VIDEO_NOT_FOUND', 'Video file not found: ' + options.video);
  }

  const stem = path.basename(videoPath, path.extname(videoPath));
  const outDir = options.output ? inside(options.output, true) : path.dirname(videoPath);
  fs.mkdirSync(outDir, { recursive: true });

  const reportPath = options.report ? inside(options.report, true) : path.join(outDir, `${stem}-qa-report.json`);
  const contactSheetPath = options.contactSheet ? inside(options.contactSheet, true) : path.join(outDir, `${stem}-contact-sheet.png`);

  const maxFrames = options.maxFrames ? Math.max(8, Math.min(24, Number(options.maxFrames) || 16)) : 16;
  const freezeThresh = options.freezeThresh ? Math.max(0.2, Number(options.freezeThresh) || 1.0) : 1.0;
  const blackThresh = options.blackThresh ? Math.max(0.1, Number(options.blackThresh) || 0.2) : 0.2;

  // 1. Probe stream metadata
  const probeData = runFFprobe(videoPath);
  const { videoInfo, audioInfo } = probeVideoProperties(probeData, videoPath);

  const checks = {};
  const issues = [];

  // 2. Decode integrity check
  const decodeRes = checkDecodeIntegrity(videoPath);
  if (!decodeRes.isValid) {
    issues.push({
      severity: 'ERROR',
      code: 'DECODE_ERROR',
      message: 'Video decode failed or produced errors: ' + (decodeRes.stderr || 'unknown bitstream error')
    });
    checks.decodeIntegrity = {
      status: 'FAILED',
      message: 'Video stream contains bitstream corruption or decode errors'
    };
  } else {
    checks.decodeIntegrity = {
      status: 'PASSED',
      message: 'Zero decode errors detected across full bitstream'
    };
  }

  // 3. Black frame detection
  const blackIntervals = detectBlackFrames(videoPath, blackThresh);
  let unexpectedBlackCount = 0;
  for (const b of blackIntervals) {
    const isOpening = b.start <= 0.05 && b.duration <= 0.5;
    const isClosing = (b.end >= videoInfo.duration - 0.05) && b.duration <= 0.5;

    if (isOpening) {
      issues.push({
        severity: 'INFO',
        code: 'INTENTIONAL_FADE_IN',
        message: `Opening fade-in detected (${b.duration.toFixed(2)}s from 0.0s)`,
        timestamp: b.start,
        frame: Math.round(b.start * videoInfo.fps)
      });
    } else if (isClosing) {
      issues.push({
        severity: 'INFO',
        code: 'INTENTIONAL_FADE_OUT',
        message: `Closing fade-out detected (${b.duration.toFixed(2)}s to ${b.end.toFixed(2)}s)`,
        timestamp: b.start,
        frame: Math.round(b.start * videoInfo.fps)
      });
    } else {
      unexpectedBlackCount++;
      const isSevere = b.duration > 1.0;
      issues.push({
        severity: isSevere ? 'ERROR' : 'WARNING',
        code: isSevere ? 'UNEXPECTED_BLACK_SCREEN' : 'BLACK_FRAME_INTERVAL',
        message: `Interior black frame sequence detected: ${b.duration.toFixed(2)}s at ${b.start.toFixed(2)}s`,
        timestamp: b.start,
        frame: Math.round(b.start * videoInfo.fps)
      });
    }
  }

  checks.blackFrames = {
    status: unexpectedBlackCount > 0 ? (issues.some(i => i.severity === 'ERROR' && i.code === 'UNEXPECTED_BLACK_SCREEN') ? 'FAILED' : 'WARNING') : 'PASSED',
    message: unexpectedBlackCount === 0 ? 'No interior black frame anomalies detected' : `${unexpectedBlackCount} interior black sequence(s) detected`,
    details: { intervals: blackIntervals }
  };

  // 4. Freeze frame detection
  const freezeIntervals = detectFreezeFrames(videoPath, freezeThresh, videoInfo.duration);

  // 5. Story Plan Continuity & Corroboration
  let storyData = null;
  let planInfo = undefined;

  if (options.plan) {
    storyData = loadStoryPlan(options.plan);
    const planRes = checkPlanContinuity(storyData, videoInfo, audioInfo);
    planInfo = planRes.planInfo;
    for (const iss of planRes.issues) issues.push(iss);
    Object.assign(checks, planRes.checks);
  } else {
    planInfo = {
      evaluated: false,
      title: 'Plan omitted (video-only mode)'
    };
    checks.dimensions = { status: 'NOT_EVALUATED', message: 'Plan omitted; dimensions not evaluated against script' };
    checks.fps = { status: 'NOT_EVALUATED', message: 'Plan omitted; fps not evaluated against script' };
    checks.frameCount = { status: 'NOT_EVALUATED', message: 'Plan omitted; frame count not evaluated against script' };
    checks.audioSync = { status: 'NOT_EVALUATED', message: 'Plan omitted; audio sync not evaluated against script' };
    checks.storyContinuity = { status: 'NOT_EVALUATED', message: 'Plan omitted; narrative continuity not evaluated' };
    checks.cinematicFraming = { status: 'NOT_EVALUATED', message: 'Plan omitted; cinematic framing not evaluated' };
  }

  // Correlate freezes with story plan or record warnings
  let unexpectedFreezeCount = 0;
  for (const fr of freezeIntervals) {
    let correlated = false;
    let correlatedShotId = undefined;

    if (storyData?.story?.scenes) {
      const midFrTime = (fr.start + fr.end) / 2;
      const midFrFrame = midFrTime * videoInfo.fps;
      for (const sc of storyData.story.scenes) {
        if (Array.isArray(sc.shots)) {
          for (const sh of sc.shots) {
            if (midFrFrame >= sh.startFrame && midFrFrame <= sh.endFrame) {
              if (sh.type === 'objectFocus' || /still|hold|diagram/i.test(sh.id || '')) {
                correlated = true;
                correlatedShotId = `${sc.id}:${sh.id} (${sh.type})`;
                break;
              }
            }
          }
        }
        if (correlated) break;
      }
    }

    if (correlated) {
      issues.push({
        severity: 'INFO',
        code: 'EXPECTED_STATIC_HOLD',
        message: `Static hold of ${fr.duration.toFixed(2)}s during ${correlatedShotId}`,
        timestamp: fr.start,
        frame: Math.round(fr.start * videoInfo.fps)
      });
    } else {
      unexpectedFreezeCount++;
      const isSevere = fr.duration > 3.0;
      issues.push({
        severity: isSevere ? 'ERROR' : 'WARNING',
        code: 'FREEZE_FRAME_INTERVAL',
        message: `Static / freeze frame sequence of ${fr.duration.toFixed(2)}s detected starting at ${fr.start.toFixed(2)}s`,
        timestamp: fr.start,
        frame: Math.round(fr.start * videoInfo.fps)
      });
    }
  }

  checks.freezeFrames = {
    status: unexpectedFreezeCount > 0 ? (issues.some(i => i.severity === 'ERROR' && i.code === 'FREEZE_FRAME_INTERVAL') ? 'FAILED' : 'WARNING') : 'PASSED',
    message: unexpectedFreezeCount === 0 ? 'No unexplained freeze anomalies detected' : `${unexpectedFreezeCount} unexplained freeze sequence(s) detected`,
    details: { intervals: freezeIntervals }
  };

  // 6. Check adjacent render preflight reports
  const adjReport = checkAdjacentReports(videoPath, options.report);
  if (adjReport && adjReport.data) {
    if (adjReport.data.diagnostic) {
      issues.push({
        severity: 'ERROR',
        code: 'PREFLIGHT_DIAGNOSTIC',
        message: `Preflight diagnostic recorded in render metadata: ${adjReport.data.diagnostic.code || 'UNKNOWN'} - ${adjReport.data.diagnostic.message || ''}`
      });
    }
  }

  // 7. Generate Contact Sheet
  const sampledFrames = selectSampledFrames(videoInfo, storyData, blackIntervals, freezeIntervals, maxFrames);
  const contactSheet = generateContactSheet(videoPath, sampledFrames, contactSheetPath, videoInfo);

  // 8. Verdict Calculation
  const hasErrors = issues.some(i => i.severity === 'ERROR');
  const hasWarnings = issues.some(i => i.severity === 'WARNING');
  const verdict = hasErrors ? 'FAILED' : (hasWarnings ? 'WARNINGS' : 'PASSED');

  const errorCount = issues.filter(i => i.severity === 'ERROR').length;
  const warnCount = issues.filter(i => i.severity === 'WARNING').length;
  const infoCount = issues.filter(i => i.severity === 'INFO').length;

  const summary = `${verdict}: ${errorCount} error(s), ${warnCount} warning(s), ${infoCount} informational finding(s)`;

  const executionTimeMs = Date.now() - startTime;

  const report = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    verdict,
    summary,
    video: videoInfo,
    audio: audioInfo,
    plan: planInfo,
    checks,
    issues,
    contactSheet,
    timing: {
      executionTimeMs
    }
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Console output
  if (!options.quiet) {
    printReportConsole(report, contactSheetPath, reportPath);
  }

  return report;
}

function printReportConsole(report, contactSheetPath, reportPath) {
  const vColor = report.verdict === 'PASSED' ? '\x1b[32m' : (report.verdict === 'WARNINGS' ? '\x1b[33m' : '\x1b[31m');
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';

  console.log(`\n${bold}================================================================${reset}`);
  console.log(`${bold} TOON-KIT VISUAL QA REPORT — ${vColor}${report.verdict}${reset}`);
  console.log(`${bold}================================================================${reset}`);
  console.log(`Video:   ${report.video.path}`);
  console.log(`Specs:   ${report.video.width}x${report.video.height} @ ${report.video.fps} fps | ${report.video.frames} frames (${report.video.duration.toFixed(2)}s) | ${report.video.codec}`);
  console.log(`Audio:   ${report.audio.present ? `${report.audio.codec} (${report.audio.channels}ch, ${report.audio.sampleRate}Hz)` : 'None (Silent)'}`);
  if (report.plan?.evaluated) {
    console.log(`Plan:    ${report.plan.path} (${report.plan.totalScenes} scenes, ${report.plan.totalShots} shots)`);
  } else {
    console.log(`Plan:    ${report.plan?.title || 'Omitted'}`);
  }
  console.log(`Timing:  ${(report.timing.executionTimeMs / 1000).toFixed(2)}s`);
  console.log(`----------------------------------------------------------------`);
  console.log(`${bold}Automated Checks:${reset}`);
  for (const [key, chk] of Object.entries(report.checks)) {
    const sColor = chk.status === 'PASSED' ? '\x1b[32m[PASS]' : (chk.status === 'WARNING' ? '\x1b[33m[WARN]' : (chk.status === 'FAILED' ? '\x1b[31m[FAIL]' : '\x1b[90m[SKIP]'));
    console.log(`  ${sColor}${reset} ${key.padEnd(16)}: ${chk.message}`);
  }

  if (report.issues.length > 0) {
    console.log(`----------------------------------------------------------------`);
    console.log(`${bold}Findings & Issues (${report.issues.length}):${reset}`);
    for (const iss of report.issues) {
      const iColor = iss.severity === 'ERROR' ? '\x1b[31mERROR  ' : (iss.severity === 'WARNING' ? '\x1b[33mWARNING' : '\x1b[36mINFO   ');
      const loc = iss.frame !== undefined ? ` [F#${iss.frame}]` : (iss.scene ? ` [${iss.scene}]` : '');
      console.log(`  ${iColor}${reset} [${iss.code}]${loc}: ${iss.message}`);
    }
  }

  console.log(`----------------------------------------------------------------`);
  console.log(`Contact Sheet : ${contactSheetPath}`);
  console.log(`QA Report     : ${reportPath}`);
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
        if (key === 'video') options.video = val;
        else if (key === 'plan') options.plan = val;
        else if (key === 'report') options.report = val;
        else if (key === 'contact-sheet') options.contactSheet = val;
        else if (key === 'output') options.output = val;
        else if (key === 'max-frames') options.maxFrames = Number(val);
        else if (key === 'freeze-thresh') options.freezeThresh = Number(val);
        else if (key === 'black-thresh') options.blackThresh = Number(val);
      } else {
        const flag = arg.slice(2);
        if (flag === 'quiet') options.quiet = true;
        else if (flag === 'json') options.json = true;
      }
    }
  }
  return options;
}

if (require.main === module) {
  try {
    const options = parseCliArgs(process.argv);
    if (!options.video) {
      console.error('Usage: node scripts/qa.cjs --video=out/example.mp4 [--plan=examples/example.story.json] [--report=out/qa.json] [--contact-sheet=out/sheet.png]');
      process.exit(1);
    }
    const reportPromise = runQA(options);
    reportPromise.then((report) => {
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      }
      process.exit(report.verdict === 'FAILED' ? 1 : 0);
    }).catch((err) => {
      console.error('\x1b[31mQA Fatal Error:\x1b[0m', err.diagnostic || err.message);
      process.exit(1);
    });
  } catch (err) {
    console.error('\x1b[31mQA Fatal Error:\x1b[0m', err.diagnostic || err.message);
    process.exit(1);
  }
}

module.exports = {
  runQA,
  checkDecodeIntegrity,
  detectBlackFrames,
  detectFreezeFrames,
  probeVideoProperties,
  selectSampledFrames,
  generateContactSheet,
  loadStoryPlan,
  checkPlanContinuity
};
