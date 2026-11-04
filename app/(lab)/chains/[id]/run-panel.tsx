"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LibraryImage, RunStep } from "@/lib/chain-lab";
import { registerUpload, runStep, startRun } from "../../run-actions";
import ui from "../../ui.module.css";
import styles from "./chain.module.css";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 6 * 1024 * 1024;

type Progress = {
  position: number;
  name: string;
  status: "pending" | "running" | "succeeded" | "failed";
  result?: RunStep;
  error?: string;
};

type Props = {
  chainId: string;
  userId: string;
  steps: { position: number; name: string }[];
  needsImage: boolean;
  images: LibraryImage[];
};

/**
 * Pick an image (or upload one), then run the chain. Each step is its own
 * request, so progress shows up step by step and no request runs long.
 */
export function RunPanel({ chainId, userId, steps, needsImage, images: initialImages }: Props) {
  const [images, setImages] = useState(initialImages);
  const [imageId, setImageId] = useState<string | null>(initialImages[0]?.id ?? null);
  const [startingText, setStartingText] = useState("");
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Progress[] | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [captions, setCaptions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const image = images.find((i) => i.id === imageId) ?? null;

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!TYPES[file.type]) return setError("Use a JPEG, PNG, or WebP image.");
    if (file.size > MAX_BYTES) return setError("Keep the image under 6 MB.");
    setUploading(true);
    const path = `${userId}/library-${crypto.randomUUID()}.${TYPES[file.type]}`;
    const { error: uploadError } = await createClient()
      .storage.from("caption-photos")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setUploading(false);
      return setError(`Upload failed: ${uploadError.message}`);
    }
    const r = await registerUpload(path);
    setUploading(false);
    if (!r.ok) return setError(r.message);
    setImages((list) => [{ id: r.id, public_url: r.url, description: "Uploaded in Chain Lab" }, ...list]);
    setImageId(r.id);
  }

  async function run() {
    setError(null);
    setCaptions(null);
    setRunning(true);
    const started = await startRun(chainId, imageId, startingText);
    if (!started.ok) {
      setRunning(false);
      return setError(started.message);
    }
    setRunId(started.runId);
    let list: Progress[] = started.steps.map((s) => ({ ...s, status: "pending" }));
    setProgress(list);

    for (const s of started.steps) {
      list = list.map((p) => (p.position === s.position ? { ...p, status: "running" } : p));
      setProgress(list);
      let r: Awaited<ReturnType<typeof runStep>>;
      try {
        r = await runStep(started.runId, s.position);
      } catch {
        r = { ok: false, message: "Lost the connection to the server. The run may be incomplete." };
      }
      if (!r.ok) {
        list = list.map((p) => (p.position === s.position ? { ...p, status: "failed", error: r.message, result: r.step } : p));
        setProgress(list);
        setError(`Step ${s.position} failed: ${r.message}`);
        break;
      }
      list = list.map((p) => (p.position === s.position ? { ...p, status: "succeeded", result: r.step } : p));
      setProgress(list);
      if (r.done) setCaptions(r.captions);
    }
    setRunning(false);
  }

  const last = progress?.[progress.length - 1];
  const finished = progress && !running;

  return (
    <section className={`${ui.card} ${styles.run}`} aria-labelledby="run-title">
      <div>
        <h2 id="run-title" className={ui.sectionTitle}>
          Run this chain
        </h2>
        <p className={styles.runLede}>
          Generates media: the steps run in order on the image you pick, and the last step&apos;s captions are saved to
          this chain&apos;s media.
        </p>
      </div>

      <fieldset className={styles.picker} disabled={running}>
        <legend>
          Image {needsImage ? "" : <span className={styles.optional}>(no step uses it)</span>}
        </legend>
        <div className={styles.pickGrid}>
          <button
            type="button"
            className={styles.uploadTile}
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "+ Upload"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {images.map((img) => (
            <label key={img.id} className={styles.pick} title={img.description ?? undefined}>
              <input
                type="radio"
                name="image"
                value={img.id}
                checked={imageId === img.id}
                onChange={() => setImageId(img.id)}
                className="visually-hidden"
              />
              <Image src={img.public_url} alt={img.description ?? "Library image"} fill sizes="80px" />
            </label>
          ))}
        </div>
        {images.length === 0 && <p className={styles.addHint}>No images in the library yet. Upload one.</p>}
      </fieldset>

      <details className={styles.starting}>
        <summary>Starting text (optional)</summary>
        <label className="field">
          <span className="visually-hidden">Starting text</span>
          <textarea
            value={startingText}
            onChange={(e) => setStartingText(e.target.value)}
            maxLength={2000}
            rows={3}
            disabled={running}
            placeholder="Passed to step 1 when it takes the previous step, and available anywhere as {{input}}."
          />
        </label>
      </details>

      <button
        type="button"
        className="btn btn-primary"
        onClick={run}
        disabled={running || uploading || steps.length === 0 || (needsImage && !image)}
      >
        {running ? "Running…" : steps.length === 0 ? "Add a step to run" : `▶ Run ${steps.length} ${steps.length === 1 ? "step" : "steps"}`}
      </button>

      {progress && (
        <ol className={styles.progress} aria-live="polite">
          {progress.map((p) => (
            <li key={p.position} data-status={p.status}>
              <span className={styles.progressDot} aria-hidden="true">
                {p.status === "succeeded" ? "✓" : p.status === "failed" ? "!" : p.position}
              </span>
              <div className={styles.progressBody}>
                <p className={styles.progressName}>
                  {p.name}
                  <span className={styles.progressState}>
                    {p.status === "running"
                      ? "running…"
                      : p.status === "succeeded"
                        ? `${p.result?.model ?? ""}${p.result?.latency_ms ? ` · ${(p.result.latency_ms / 1000).toFixed(1)}s` : ""}`
                        : p.status === "failed"
                          ? "failed"
                          : "waiting"}
                  </span>
                </p>
                {p.status === "succeeded" && p.result?.result && p.result.output === "text" && (
                  <p className={styles.progressOut}>{p.result.result}</p>
                )}
                {p.status === "failed" && p.error && <p className={styles.progressErr}>{p.error}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {error && !progress && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}

      {captions && captions.length > 0 && (
        <div className={styles.result}>
          {image && (
            <div className={styles.resultImage}>
              <Image src={image.public_url} alt="" fill sizes="340px" />
            </div>
          )}
          <ol className={styles.captions}>
            {captions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </div>
      )}
      {finished && last?.status === "succeeded" && !captions?.length && last.result?.result && (
        <div className={styles.finalText}>
          <p className={ui.kicker}>Final output</p>
          <p>{last.result.result}</p>
        </div>
      )}
      {finished && runId && (
        <div className={ui.actions}>
          <Link href={`/runs/${runId}`} className="btn btn-sm">
            Open this run
          </Link>
          <Link href={`/chains/${chainId}/media`} className="btn btn-ghost btn-sm">
            All media →
          </Link>
        </div>
      )}
    </section>
  );
}
