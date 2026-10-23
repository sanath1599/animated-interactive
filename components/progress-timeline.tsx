import { STAGES, STAGE_LABELS, type StageId } from "@/types/run";

/** Stages are marked done only when a later stage has really started (or the run succeeded). */
export function ProgressTimeline({ current, finished }: { current: StageId | null; finished: boolean }) {
  const idx = current ? STAGES.indexOf(current) : -1;
  return (
    <ol className="timeline" aria-label="Progress">
      {STAGES.map((s, i) => {
        const state = finished && current === "ready" ? "done" : i < idx ? "done" : i === idx ? "active" : "";
        return (
          <li key={s} className={state} aria-current={state === "active" ? "step" : undefined}>
            <span className="dot" aria-hidden />
            <span>{STAGE_LABELS[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}
