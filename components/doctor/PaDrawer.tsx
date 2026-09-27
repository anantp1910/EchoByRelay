"use client";

import { Check, ExternalLink, FileWarning, PencilLine, Printer, RotateCcw, Undo2 } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { FIXTURE_PA } from "@/components/fixtures";
import { PA_STATUS } from "@/components/labels";
import { SimulatedBadge } from "@/components/SimulatedBadge";
import { TONE_CLASSES, type Tone } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { VoiceButton } from "@/components/VoiceButton";
import { ApiError, getPa } from "@/lib/api/client";
import type { ApproveVia, PaRes } from "@/lib/api/contracts";
import { supabase } from "@/lib/db/client";
import type { AgentEvent } from "@/lib/db/types";
import { cn } from "@/lib/utils";

import { APPROVE_COMMAND } from "./voiceCommands";

type Loaded = { key: string; pa: PaRes | null; error: string | null };

interface PaDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rxId: string;
  /** The paDrafter step (data.action "submit_pa") for this prescription, if loaded. */
  event?: AgentEvent;
  onApprove: (event: AgentEvent, via: ApproveVia) => void;
}

/**
 * PA letter drawer: the drafted letter with numbered citations to the FDA
 * label, Approve (submits the PA), a preview-only editor, and approve-by-voice.
 * Parent remounts it per rxId (key), so edits never leak across letters.
 */
export function PaDrawer({ open, onOpenChange, rxId, event, onApprove }: PaDrawerProps) {
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [activeCite, setActiveCite] = useState<number | null>(null);

  // Refetch when the step's status moves (approve → submitted) or the PA row changes.
  const key = `${rxId}|${event?.status ?? ""}|${nonce}`;
  const loading = open && loaded?.key !== key;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const request: Promise<PaRes> = supabase ? getPa(rxId) : Promise.resolve(FIXTURE_PA);
    request.then(
      (pa) => {
        if (!cancelled) setLoaded({ key, pa, error: null });
      },
      (e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.code === "not_found") setLoaded({ key, pa: null, error: null });
        else setLoaded({ key, pa: null, error: e instanceof Error ? e.message : "Could not load the letter" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [open, rxId, key]);

  useEffect(() => {
    if (!open || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`pa_requests:${rxId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pa_requests", filter: `rx_id=eq.${rxId}` }, () =>
        setNonce((n) => n + 1)
      )
      .subscribe();
    return () => void client.removeChannel(channel);
  }, [open, rxId]);

  const pa = loaded?.key === key ? loaded.pa : (loaded?.pa ?? null);
  const error = loaded?.key === key ? loaded.error : null;
  const letter = draft ?? pa?.letterMd ?? "";
  const edited = draft !== null && draft !== pa?.letterMd;
  const canApprove = event?.status === "needs_approval";

  const status: { label: string; tone: Tone } | null =
    event?.status === "rejected"
      ? { label: "Declined", tone: "blocked" }
      : pa?.status === "draft" && event?.status === "approved"
        ? { label: "Approved · submitting to payer", tone: "pending" }
        : pa
          ? PA_STATUS[pa.status]
          : null;

  function cite(n: number) {
    setActiveCite(n);
    const el = document.getElementById(`pa-cite-${n}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el?.focus({ preventScroll: true });
  }

  function approveNow(via: ApproveVia) {
    if (event && canApprove) onApprove(event, via);
  }

  function handleVoice(text: string) {
    if (!APPROVE_COMMAND.test(text)) {
      toast("Say “approve” to submit this PA");
      return;
    }
    if (canApprove) approveNow("voice");
    else toast("This letter isn't waiting for approval");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        data-testid="pa-drawer"
      >
        <SheetHeader className="border-b border-line pr-12">
          <SheetTitle>Prior authorization letter</SheetTitle>
          <SheetDescription>Every clinical claim cites the FDA label.</SheetDescription>
          {status && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                data-testid="pa-status"
                className={cn(
                  "inline-flex h-6 w-fit items-center rounded-full border px-2 text-xs font-medium",
                  TONE_CLASSES[status.tone]
                )}
              >
                {status.label}
              </span>
              {/* Submission and decisions come from the mock payer. */}
              {(event?.status === "approved" || (pa && pa.status !== "draft")) && <SimulatedBadge label="Simulated payer" />}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {loading && !pa ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading letter">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-block/30 bg-block-soft p-4 text-sm text-block-strong">
              <span className="font-medium">Couldn&apos;t load the letter</span>
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)}>
                <RotateCcw aria-hidden /> Try again
              </Button>
            </div>
          ) : !pa ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <FileWarning aria-hidden className="size-6 text-muted-foreground" />
              <p className="font-medium">No letter drafted yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                The PA drafter posts it to the timeline as soon as it&apos;s ready.
              </p>
            </div>
          ) : (
            <>
              {edited && (
                <p
                  role="status"
                  className={cn("mb-3 rounded-lg border px-3 py-2 text-sm", TONE_CLASSES.risk)}
                >
                  Preview only: edits aren&apos;t saved. Approve submits the original draft.
                </p>
              )}

              {editing ? (
                <textarea
                  value={letter}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="Edit letter draft (not saved)"
                  className="min-h-[24rem] w-full rounded-lg border border-line bg-background p-3 font-mono text-sm leading-6 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                />
              ) : (
                <article className="space-y-3 text-[0.95rem] leading-7" data-testid="pa-letter">
                  <LetterMarkdown md={letter} onCite={cite} citeCount={pa.citations.length} />
                </article>
              )}

              {pa.citations.length > 0 && (
                <section aria-labelledby="pa-citations" className="mt-6 border-t border-line pt-4">
                  <h3 id="pa-citations" className="mb-3 text-sm font-bold">
                    Citations · FDA label
                  </h3>
                  <ol className="space-y-3">
                    {pa.citations.map((c) => (
                      <li
                        key={c.n}
                        id={`pa-cite-${c.n}`}
                        tabIndex={-1}
                        className={cn(
                          "rounded-lg border border-line p-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          activeCite === c.n && "border-pending/50 bg-pending-soft"
                        )}
                      >
                        <p className="flex items-baseline gap-2 text-sm font-medium">
                          <span className="font-mono text-xs text-muted-foreground tabular">[{c.n}]</span>
                          {c.section}
                        </p>
                        <blockquote className="mt-1.5 border-l-2 border-line pl-3 text-sm text-muted-foreground">
                          &ldquo;{c.quote}&rdquo;
                        </blockquote>
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-[var(--echo-accent)] underline-offset-2 hover:underline"
                        >
                          View on DailyMed <ExternalLink aria-hidden className="size-3.5" />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-card px-4 py-3 sm:px-6">
          <Button onClick={() => approveNow("click")} disabled={!canApprove} data-testid="pa-approve">
            <Check aria-hidden /> Approve &amp; submit
          </Button>
          <Button
            variant="outline"
            onClick={() => setEditing((v) => !v)}
            disabled={!pa}
            aria-pressed={editing}
            data-testid="pa-edit"
          >
            <PencilLine aria-hidden /> {editing ? "Done editing" : "Edit draft · not saved"}
          </Button>
          {edited && (
            <Button variant="ghost" onClick={() => setDraft(null)}>
              <Undo2 aria-hidden /> Discard edits
            </Button>
          )}
          {supabase && pa && (
            <Button
              variant="ghost"
              nativeButton={false}
              render={<a href={`/api/pa/${encodeURIComponent(rxId)}/print`} target="_blank" rel="noopener noreferrer" />}
            >
              <Printer aria-hidden /> Print
            </Button>
          )}
          {canApprove && (
            <VoiceButton
              size="sm"
              onTranscript={handleVoice}
              hint="Hold and say “approve”"
              className="ml-auto"
            />
          )}
        </footer>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Minimal Markdown for the drafter's letters: #/## headings, **bold**, [n]
// citations, "- " lists, paragraphs with line breaks. Builds React nodes; never
// injects HTML.
// ---------------------------------------------------------------------------

function Inline({ text, onCite, citeCount }: { text: string; onCite: (n: number) => void; citeCount: number }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const bold = /^\*\*([^*]+)\*\*$/.exec(part);
        if (bold) return <strong key={i}>{bold[1]}</strong>;
        const ref = /^\[(\d+)\]$/.exec(part);
        if (ref) {
          const n = Number(ref[1]);
          if (n >= 1 && n <= citeCount) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onCite(n)}
                aria-label={`Citation ${n}`}
                className="relative mx-0.5 rounded px-0.5 align-super font-mono text-xs font-bold text-[var(--echo-accent)] before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-1/2 before:content-[''] hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                [{n}]
              </button>
            );
          }
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function LetterMarkdown({ md, onCite, citeCount }: { md: string; onCite: (n: number) => void; citeCount: number }) {
  const blocks = md.trim().split(/\n{2,}/);
  const inline = (t: string) => <Inline text={t} onCite={onCite} citeCount={citeCount} />;
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (/^#{1,3} /.test(block) && lines.length === 1) {
          return (
            <h3 key={i} className="font-heading text-lg font-bold">
              {inline(block.replace(/^#{1,3} /, ""))}
            </h3>
          );
        }
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j): ReactNode => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
