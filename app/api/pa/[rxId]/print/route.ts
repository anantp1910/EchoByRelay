// GET /api/pa/[rxId]/print -> print-styled HTML of the latest PA letter.
//
// Letterhead (demo prescriber clinic), rendered Markdown letter, numbered
// citations with section + verbatim quote + DailyMed link, and a small demo
// footer. Browser Print -> Save as PDF yields a clean one-page letter.

import { DEMO_PRESCRIBER } from "@/lib/demo/constants";

export const dynamic = "force-dynamic";

function hasServerEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** Minimal Markdown -> HTML for our controlled letter format (## headings, **bold**, blocks). */
function renderMarkdown(md: string): string {
  const out: string[] = [];
  let block: string[] = [];
  const flush = () => {
    if (block.length) {
      out.push(`<p>${block.map(inline).join("<br>")}</p>`);
      block = [];
    }
  };
  for (const line of md.split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      flush();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
      continue;
    }
    block.push(line);
  }
  flush();
  return out.join("\n");
}

interface StoredCitation {
  n: number;
  section: string;
  quote: string;
  url: string;
}

function page(letterHtml: string, citations: StoredCitation[]): string {
  const citationsHtml = citations
    .map(
      (c) =>
        `<li><span class="sec">[${c.n}] ${esc(c.section)}</span><br>` +
        `<span class="quote">&ldquo;${esc(c.quote)}&rdquo;</span><br>` +
        `<a href="${esc(c.url)}">${esc(c.url)}</a></li>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Prior Authorization Letter</title>
<style>
  @page { size: letter; margin: 1in; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; line-height: 1.5; max-width: 7.5in; margin: 0 auto; padding: 32px; }
  .letterhead { border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 22px; }
  .letterhead .clinic { font-size: 20px; font-weight: bold; color: #0f766e; letter-spacing: .2px; }
  .letterhead .addr { font-size: 12px; color: #555; margin-top: 2px; }
  h1, h2 { color: #0f766e; }
  h2 { font-size: 15px; margin: 16px 0 4px; }
  p { margin: 8px 0; }
  strong { color: #111; }
  .citations { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 12px; }
  .citations h3 { font-size: 13px; margin: 0 0 8px; color: #0f766e; }
  .citations ol { margin: 0; padding-left: 20px; }
  .citations li { margin-bottom: 10px; }
  .citations .sec { font-weight: bold; }
  .citations .quote { color: #333; font-style: italic; }
  .citations a { color: #0f766e; word-break: break-all; text-decoration: none; }
  .footer { margin-top: 26px; font-size: 10px; color: #999; text-align: center; }
  @media print { body { padding: 0; max-width: none; } }
</style>
</head>
<body>
  <div class="letterhead">
    <div class="clinic">${esc(DEMO_PRESCRIBER.clinic)}</div>
    <div class="addr">${esc(DEMO_PRESCRIBER.specialty)} &middot; ${esc(DEMO_PRESCRIBER.city)} &middot; NPI ${esc(DEMO_PRESCRIBER.npi)} (demo)</div>
  </div>
  ${letterHtml}
  <div class="citations">
    <h3>Citations — FDA label via DailyMed</h3>
    <ol>${citationsHtml}</ol>
  </div>
  <div class="footer">Demo — synthetic patient. Not a real prior authorization.</div>
</body>
</html>`;
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rxId: string }> }
): Promise<Response> {
  const { rxId } = await params;

  if (!/^[0-9a-fA-F-]{36}$/.test(rxId)) {
    return htmlResponse(page("<p>Invalid prescription id.</p>", []), 400);
  }
  if (!hasServerEnv()) {
    return htmlResponse(page("<p>No prior authorization is available.</p>", []), 404);
  }

  const { db } = await import("@/lib/db/server");
  const { data, error } = await db
    .from("pa_requests")
    .select("letter_md, citations")
    .eq("rx_id", rxId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return htmlResponse(page("<p>No prior authorization has been drafted for this prescription yet.</p>", []), 404);
  }

  const letterHtml = renderMarkdown((data.letter_md as string) ?? "");
  const citations = (data.citations as StoredCitation[]) ?? [];
  return htmlResponse(page(letterHtml, citations));
}
