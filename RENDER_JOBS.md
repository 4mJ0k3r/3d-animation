# Portable render jobs (Phase 7A)

A render job is a self-contained directory that carries one validated StoryDocument
and the local assets it references to a separate Toon-Kit worker. Transport is
manual (copy, zip, scp, USB). There is no server, upload, polling or cloud
integration. Those are not part of Phase 7A.

```
Script -> Muse -> story JSON + public/audio files -> package -> (copy) -> worker run -> MP4 + result.json
```

## Commands

```sh
# On the authoring machine (inside a Toon-Kit checkout):
npm run job -- package --plan=examples/name.story.json --out=out/jobs-outbox
# -> out/jobs-outbox/<jobId>/   (copy this whole directory to the worker)

# On the worker (inside its own Toon-Kit checkout; the package may live anywhere):
npm run job -- verify --job=/path/to/<jobId>
npm run job -- run --job=/path/to/<jobId> [--verify=true]
```

`run` prints `RENDER_JOB_RESULT {...}` and writes `out/jobs/<jobId>/result.json`.
Exit code: 0 COMPLETED, 2 BLOCKED, 1 FAILED.

## Package format (`toonkit-render-job` v1)

```
<jobId>/
  manifest.json
  story.json                       # the StoryDocument, byte-for-byte
  assets/audio/<path>.mp3|wav|...  # exactly the files story.audio.assets references
```

`manifest.json` holds:
- `format` and `version`;
- `jobId`: `tk-` followed by 24 hex characters of a SHA-256 over the story hash,
  asset paths and hashes, the requested output and the engine digest;
- `story` (`file`, `sha256`, `bytes`) and `assets[]` (`src`, `file`, `sha256`, `bytes`);
- `output`: mp4/h264 with width, height, fps, frames and whether audio is present;
- `engine`: `digest`, git `commit` and a `dirty` flag. The digest is a
  line-ending-normalized SHA-256 of `src/`, `scripts/` and the package files;
- `runtime`: Node major version and the Remotion version.

All paths are forward-slash and relative. Packages contain no absolute machine
paths, no code, no Git data and no workspace files. The bundled font is part of
the engine and is checked by the existing pinned-font validation.

## What the worker checks and does

1. **Package integrity:** the manifest has an exact schema and a known version.
   It recomputes `jobId`. Story and asset checksums and sizes must match, and
   the assets must be exactly the ones the story references (32 at most;
   16 MiB per asset, 32 MiB in total). It rejects traversal, absolute, drive or
   backslash paths, symlinks, junctions and any extra file. Errors: `JOB_*`.
2. **Compatibility:** the worker must have the same Node major version and
   Remotion version, and an identical engine digest (`ENGINE_MISMATCH`), so a
   job renders only on the engine it was authored for.
3. **One job at a time:** the worker takes `.remotion-tmp/render-job.lock`
   (`WORKER_BUSY`) and then the existing authoring and production locks. A
   live lock is never removed.
4. **Asset staging:** it copies assets into a worker-owned
   `public/audio/jobs/<jobId>/` folder, never overwriting a different file
   (`STAGING_CONFLICT`). It removes that folder afterwards.
5. **Rendering:** it runs the existing guarded `story render` on
   `out/jobs/<jobId>/story.json`. That covers memory admission, whole-story
   preflight before encoding, sequential segments with resumable manifests,
   SwiftShader, concurrency 1 and workspace temp paths.
6. **Output checks:** it probes the published MP4 with ffprobe. Codec,
   resolution, fps, exact frame count and the presence of audio must match the
   manifest, otherwise `OUTPUT_VERIFICATION`. An unverified file is renamed
   `video.mp4.incomplete`.

The result fields are `jobId`, `inputFingerprint`, `engine`, `status`
(COMPLETED, BLOCKED or FAILED), `output`, `outputSHA256`, `frames`,
`durationSeconds`, `preflight`, `resources` (peak RSS and temp), `error`
(the structured diagnostic) and `wallMs`. BLOCKED means the job is fine but
this worker cannot run it now: wrong engine or runtime, busy, memory
admission, or missing FFmpeg or font.

**Resume:** rerun the same `run` command. A verified COMPLETED job returns
immediately (`resumed: "already-complete"`). A long job that failed keeps its
completed segments in `out/jobs/<jobId>/video.mp4.segments/`, and the existing
fingerprinted manifest resumes them. Changing the engine changes the job ID.

## Setting up a separate worker (Windows or Linux)

1. Install Node 24 and a full FFmpeg build with `ffprobe` on PATH.
2. `git clone https://github.com/4mJ0k3r/3d-animation.git`, then
   `git checkout <manifest.engine.commit>` and `npm ci`.
3. Copy the package directory anywhere on the worker.
4. Run `npm run job -- verify --job=<dir>`. If it reports `ENGINE_MISMATCH`, the
   checkout differs. Use the exact commit with clean `src/` and `scripts/`.
5. Run `npm run job -- run --job=<dir>`, then collect `out/jobs/<jobId>/video.mp4`
   and `result.json`.

On Linux, the existing memory admission requires at least 2.5 GiB MemAvailable
and aborts below 1 GiB. These limits are unchanged; wait for memory rather than
lowering them.
