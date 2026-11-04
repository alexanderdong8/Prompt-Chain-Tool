"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LibraryImage, RunStep } from "@/lib/chain-lab";
import { abandonRun, registerUpload, runStep, startRun } from "../../run-actions";
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
    const started = await startRun(chainId, needsImage ? imageId : null, "");
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
        await abandonRun(started.runId, s.position).catch(() => {});
        r = { ok: false, message: "The request was cut off. Try running again." };
      }
      if (!r.ok) {
        list = list.map((p) => (p.position === s.position ? { ...p, status: "failed", error: r.message, result: r.step } : p));
        setProgress(list);
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
      <h2 id="run-title" className={ui.sectionTitle}>
        Run
      </h2>

      {needsImage && (
        <fieldset className={styles.picker} disabled={running}>
          <legend className="visually-hidden">Image</legend>
          <div className={styles.pickGrid}>
            <button
              type="button"
              className={styles.uploadTile}
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? "…" : "+ Upload"}
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
            {images.map((img, i) => (
              <label key={img.id} className={styles.pick} title={img.description ?? undefined}>
                <input
                  type="radio"
                  aria-label={img.description ?? `Image ${i + 1}`}
                  name="image"
                  value={img.id}
                  checked={imageId === img.id}
                  onChange={() => setImageId(img.id)}
                  className="visually-hidden"
                />
                <Image src={img.public_url} alt="" fill sizes="80px" />
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={run}
        disabled={running || uploading || steps.length === 0 || (needsImage && !image)}
      >
        {running ? "Running…" : "▶ Run chain"}
      </button>

      {progress && (
        <ol className={styles.progress} aria-live="polite">
          {progress.map((p) => (
            <li key={p.position} data-status={p.status}>
              <span className={styles.progressDot} aria-hidden="true">
                {p.status === "succeeded" ? "✓" : p.status === "failed" ? "!" : p.position}
              </span>
              <div className={styles.progressBody}>
                <p className={styles.progressName}>{p.name}</p>
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
        <ol className={styles.captions}>
          {captions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      )}
      {finished && last?.status === "succeeded" && !captions?.length && last.result?.result && (
        <p className={styles.finalText}>{last.result.result}</p>
      )}
      {finished && runId && (
        <Link href={`/runs/${runId}`} className={styles.runLink}>
          View run details →
        </Link>
      )}
    </section>
  );
}
