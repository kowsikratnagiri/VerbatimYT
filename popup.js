// VerbatimYT — YouTube Transcript Exporter
// Built by Kowsik Ratnagiri
// v3.2 — Updated for YouTube 2026 UI

const statusEl    = document.getElementById("status");
const statusText  = document.getElementById("status-text");
const exportBtn   = document.getElementById("exportBtn");
const copyBtn     = document.getElementById("copyBtn");
const captionLangEl   = document.getElementById("captionLang");
const translateLangEl = document.getElementById("translateLang");
const keepTsEl    = document.getElementById("keepTimestamps");
const tsPill      = document.getElementById("tsTogglePill");
const rawModeEl   = document.getElementById("rawMode");
const rawPill     = document.getElementById("rawTogglePill");

let selectedFormat = "pdf";

document.querySelectorAll(".fmt-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".fmt-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedFormat = btn.dataset.fmt;
  });
});

keepTsEl.addEventListener("change", () => {
  tsPill.classList.toggle("active", keepTsEl.checked);
});

rawModeEl.addEventListener("change", () => {
  rawPill.classList.toggle("active", rawModeEl.checked);
});

function setStatus(msg, type = "") {
  statusEl.className = type;
  statusText.textContent = msg;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.getElementById("retryBtn").addEventListener("click", () => init());

// ── Debug: scan page and report exactly what's there ──────────────────────
async function debugScan() {
  const tab = await getActiveTab();
  setStatus("Scanning page...", "loading");

  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const report = [];

      // Check all possible transcript buttons
      const btns = document.querySelectorAll("button, tp-yt-paper-button");
      const transcriptBtns = [];
      btns.forEach(btn => {
        const t = btn.textContent?.trim();
        const label = btn.getAttribute("aria-label");
        if (t?.toLowerCase().includes("transcript") || label?.toLowerCase().includes("transcript")) {
          transcriptBtns.push(`"${t}" [aria-label="${label}"]`);
        }
      });
      report.push(`Transcript buttons: ${transcriptBtns.length > 0 ? transcriptBtns.join(", ") : "NONE FOUND"}`);

      // Check section renderer
      const sectionRenderer = document.querySelector("ytd-video-description-transcript-section-renderer");
      report.push(`Section renderer: ${sectionRenderer ? "FOUND" : "not found"}`);

      // Check transcript selectors
      const checks = {
        "ytd-transcript-segment-renderer": document.querySelectorAll("ytd-transcript-segment-renderer").length,
        "transcript-segment-view-model": document.querySelectorAll("transcript-segment-view-model").length,
        "ytd-transcript-cue-renderer": document.querySelectorAll("ytd-transcript-cue-renderer").length,
        "#segments-container": document.querySelector("#segments-container") ? 1 : 0,
        "engagement-panels": document.querySelectorAll("ytd-engagement-panel-section-list-renderer").length,
      };
      for (const [sel, count] of Object.entries(checks)) {
        if (count > 0) report.push(`✅ ${sel}: ${count}`);
        else report.push(`❌ ${sel}: 0`);
      }

      return report.join(" | ");
    },
  });

  const report = result[0]?.result || "No data";
  // Show in status and copy to clipboard
  navigator.clipboard?.writeText(report);
  setStatus("Copied to clipboard! Send this to fix: " + report.substring(0, 80) + "...", "success");
  console.log("VerbatimYT Debug:", report);
}

async function init() {
  const tab = await getActiveTab();
  if (!tab.url || !tab.url.includes("youtube.com/watch")) {
    setStatus("Please open a YouTube video first.", "error");
    captionLangEl.innerHTML = '<option value="">Open a YouTube video first</option>';
    exportBtn.disabled = true;
    copyBtn.disabled = true;
    return;
  }
  captionLangEl.innerHTML = '<option value="dom">🌐 Auto-detect transcript</option>';
  setStatus("Ready! Click Export to get the transcript.", "success");
  exportBtn.disabled = false;
  copyBtn.disabled = false;
}

// ── Injected into page: click Show Transcript ──────────────────────────────
function clickShowTranscript() {
  // Updated selectors for YouTube 2026 UI
  // 1. Try aria-label first (most reliable)
  const ariaBtn = document.querySelector('[aria-label="Show transcript"]');
  if (ariaBtn) { ariaBtn.click(); return "aria-label"; }

  // 2. Try the transcript section renderer button (2025+ UI)
  const sectionBtn = document.querySelector(
    "ytd-video-description-transcript-section-renderer button"
  );
  if (sectionBtn) { sectionBtn.click(); return "section-renderer"; }

  // 3. Expand description first, then look again
  const expandBtn = document.querySelector(
    "tp-yt-paper-button#expand, " +
    "ytd-text-inline-expander #expand, " +
    "#description-inline-expander #expand, " +
    "ytd-structured-description-content-renderer tp-yt-paper-button"
  );
  if (expandBtn) {
    expandBtn.click();
    // After expanding, try again
    setTimeout(() => {
      const btn2 = document.querySelector('[aria-label="Show transcript"]')
        || document.querySelector("ytd-video-description-transcript-section-renderer button");
      if (btn2) btn2.click();
    }, 800);
    return "expanded-then-clicked";
  }

  // 4. Text content fallback
  const allBtns = document.querySelectorAll("button, tp-yt-paper-button");
  for (const btn of allBtns) {
    const t = btn.textContent?.trim().toLowerCase();
    if (t === "show transcript" || t.includes("show transcript")) {
      btn.click();
      return "text-match";
    }
  }

  return "not-found";
}

// ── Injected into page: scrape transcript ─────────────────────────────────
function scrapeTranscript(keepTimestamps) {

  const SKIP_LINES = ["Transcript","Timeline","Search in video","In this video","Follow along using the transcript."];
  const isTimestamp = t => /^\d{1,2}:\d{2}(:\d{2})?$/.test(t);

  // ── CORE APPROACH: use innerText of entire panel then parse lines ──────────
  // YouTube renders each segment as TWO lines in innerText:
  //   Line 1: "1:23"        ← timestamp
  //   Line 2: "Hello world" ← text
  // This is true for ALL YouTube UI versions — classic and new
  
  function parseFromInnerText(raw) {
    const allLines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    const result = [];
    let i = 0;
    while (i < allLines.length) {
      const line = allLines[i];
      // Skip header lines
      if (SKIP_LINES.includes(line)) { i++; continue; }
      // If this line is a timestamp and next line is text
      if (isTimestamp(line) && i + 1 < allLines.length) {
        const nextLine = allLines[i + 1];
        if (!isTimestamp(nextLine) && !SKIP_LINES.includes(nextLine)) {
          if (keepTimestamps) {
            result.push(`[${line}]  ${nextLine}`);
          } else {
            result.push(nextLine);
          }
          i += 2; // consumed both timestamp + text
          continue;
        }
      }
      // Not a timestamp line and not a header — just text
      if (!isTimestamp(line) && line.length > 1) {
        result.push(line);
      }
      i++;
    }
    return result;
  }

  // Try all possible transcript containers — all use the same innerText format
  const containerSelectors = [
    "#segments-container",
    "ytd-transcript-body-renderer",
    "ytd-transcript-renderer",
    "ytd-engagement-panel-section-list-renderer",
    "[target-id='engagement-panel-searchable-transcript']",
    "#transcript-scrollbox",
  ];

  for (const sel of containerSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const raw = el.innerText || "";
      if (raw.length < 100) continue;
      if ((raw.match(/\d:\d\d/g) || []).length < 3) continue;
      
      const lines = parseFromInnerText(raw);
      if (lines.length > 5) {
        const separator = keepTimestamps ? "\n" : " ";
        return { 
          success: true, 
          text: lines.join(separator), 
          method: sel 
        };
      }
    }
  }

  // Debug info
  const segCount = document.querySelectorAll("ytd-transcript-segment-renderer").length;
  const newSegCount = document.querySelectorAll("transcript-segment-view-model").length;
  const hasContainer = !!document.querySelector("#segments-container");
  const panelCount = document.querySelectorAll("ytd-engagement-panel-section-list-renderer").length;

  return {
    success: false,
    error: `Transcript panel not found or not open. segs:${segCount} newSegs:${newSegCount} container:${hasContainer} panels:${panelCount}. Try: scroll down to description, click Show Transcript manually, then click Export.`
  };
}

// ── Clean timestamps ───────────────────────────────────────────────────────
function cleanTimestamps(text) {
  return text
    .replace(/\d+\s*hours?,\s*\d+\s*minutes?,\s*\d+\s*seconds?/gi, "")
    .replace(/\d+\s*hours?,\s*\d+\s*minutes?/gi, "")
    .replace(/\d+\s*minutes?,\s*\d+\s*seconds?/gi, "")
    .replace(/\d+\s*minutes?/gi, "")
    .replace(/\d+\s*seconds?/gi, "")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Format into readable paragraphs ───────────────────────────────────────
function formatParagraphs(text) {
  // Topic shift words that signal a new paragraph
  const topicShifters = [
    "Now,", "Now ", "So,", "So ", "But ", "But,",
    "Let me", "Let's", "Moving on", "Next,", "Next ",
    "Another ", "However,", "However ", "First,", "Second,",
    "Third,", "Finally,", "Also,", "Also ", "And then",
    "The thing is", "Here's the thing", "The point is",
    "What I mean", "In other words", "For example",
    "For instance", "That said", "Having said",
    "On the other hand", "At the same time",
    "The reason", "The problem", "The issue",
    "What happens", "What we", "What you",
    "I think", "I believe", "I want to", "I'm going to",
    "We need to", "We have to", "We can",
    "This is", "This means", "This is why",
    "That's why", "That's the", "That's what",
  ];

  // Step 1: Fix punctuation — add periods where sentences likely end
  // YouTube transcripts often have no punctuation
  text = text
    .replace(/([a-z])\s+([A-Z])/g, (m, a, b) => `${a}. ${b}`)  // lowercase then uppercase = new sentence
    .replace(/\s{2,}/g, " ")
    .trim();

  // Step 2: Split into sentences roughly
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];

  // Step 3: Group sentences into paragraphs
  const paragraphs = [];
  let current = [];
  let charCount = 0;

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;

    const startsNewParagraph = topicShifters.some(t =>
      s.startsWith(t) || s.includes(`. ${t}`)
    );

    // Break paragraph if:
    // 1. Current paragraph is long enough AND sentence starts a new topic
    // 2. Current paragraph exceeds ~500 chars
    // 3. Sentence starts with a question word after content
    const isLong = charCount > 500;
    const isQuestion = s.includes("?") && charCount > 200;

    if ((startsNewParagraph && charCount > 200) || isLong || isQuestion) {
      if (current.length > 0) {
        paragraphs.push(current.join(" ").trim());
        current = [];
        charCount = 0;
      }
    }

    current.push(s);
    charCount += s.length;
  }

  // Push remaining
  if (current.length > 0) {
    paragraphs.push(current.join(" ").trim());
  }

  // Filter empty paragraphs
  return paragraphs.filter(p => p.trim().length > 10);
}

async function getPageInfo(tab) {
  const r = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      title: document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim()
        || document.querySelector("h1 yt-formatted-string")?.textContent?.trim()
        || document.title.replace(" - YouTube", "").trim(),
      channel: document.querySelector("#owner #channel-name a")?.textContent?.trim()
        || document.querySelector("#channel-name a")?.textContent?.trim()
        || "Unknown Channel",
    }),
  });
  return r[0].result;
}

async function getTranscript() {
  const tab = await getActiveTab();
  const keepTs = keepTsEl.checked;
  const translateTo = translateLangEl.value;
  const { title, channel } = await getPageInfo(tab);

  // Step 1: Click Show Transcript
  setStatus("Opening transcript panel...", "loading");
  const clickResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: clickShowTranscript,
  });
  const clickMethod = clickResult[0]?.result;

  // Step 2: Wait — longer if we had to expand description first
  const waitTime = clickMethod === "expanded-then-clicked" ? 4500 : 3500;
  setStatus("Waiting for transcript to load...", "loading");
  await new Promise(r => setTimeout(r, waitTime));

  // Step 3: Scrape
  setStatus("Reading transcript...", "loading");
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrapeTranscript,
    args: [keepTs],
  });

  let scraped = result[0]?.result;

  // Step 4: If not found yet, wait more and retry once
  if (!scraped?.success) {
    setStatus("Retrying...", "loading");
    await new Promise(r => setTimeout(r, 2000));
    const retry = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeTranscript,
      args: [keepTs],
    });
    scraped = retry[0]?.result;
  }

  if (!scraped?.success) {
    throw new Error(scraped?.error || "Could not read transcript. Make sure the video has captions and scroll down to the description first.");
  }

  const rawMode = rawModeEl.checked;
  let text = keepTs ? scraped.text : cleanTimestamps(scraped.text);

  // Format into paragraphs by default unless raw mode or timestamps are on
  if (!rawMode && !keepTs) {
    const paras = formatParagraphs(text);
    text = paras.join("\n\n");
  }

  if (!text || text.length < 10) throw new Error("Transcript appears to be empty.");
  if (translateTo) text = await translateText(text, translateTo);

  return { title, channel, text };
}

async function translateText(text, targetLang) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 400) {
    let cut = remaining.lastIndexOf(". ", 400);
    if (cut === -1) cut = 400; else cut += 1;
    chunks.push(remaining.substring(0, cut).trim());
    remaining = remaining.substring(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  const translated = [];
  for (let i = 0; i < chunks.length; i++) {
    setStatus(`Translating... ${i + 1}/${chunks.length}`, "loading");
    try {
      const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunks[i])}&langpair=en|${targetLang}`);
      const data = await resp.json();
      translated.push(data.responseData?.translatedText || chunks[i]);
      await new Promise(r => setTimeout(r, 300));
    } catch(e) { translated.push(chunks[i]); }
  }
  return translated.join(" ");
}

exportBtn.addEventListener("click", async () => {
  exportBtn.disabled = true;
  copyBtn.disabled = true;
  try {
    const { title, channel, text } = await getTranscript();
    setStatus(`Generating ${selectedFormat.toUpperCase()}...`, "loading");
    if (selectedFormat === "pdf")  buildPDF(title, channel, text);
    if (selectedFormat === "docx") await buildDOCX(title, channel, text);
    if (selectedFormat === "txt")  buildTXT(title, channel, text);
    setStatus(`✓ ${selectedFormat.toUpperCase()} downloaded!`, "success");
  } catch(e) {
    setStatus(e.message || "Export failed.", "error");
  }
  exportBtn.disabled = false;
  copyBtn.disabled = false;
});

copyBtn.addEventListener("click", async () => {
  exportBtn.disabled = true;
  copyBtn.disabled = true;
  try {
    const { text } = await getTranscript();
    await navigator.clipboard.writeText(text);
    setStatus("✓ Copied to clipboard!", "success");
  } catch(e) {
    setStatus(e.message || "Copy failed.", "error");
  }
  exportBtn.disabled = false;
  copyBtn.disabled = false;
});

function buildPDF(title, channel, fullText) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20, maxW = pageW - margin * 2;

  doc.setFillColor(204, 0, 0);
  doc.rect(0, 0, pageW, 36, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 180, 180);
  doc.text("VerbatimYT", pageW - margin, 8, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(doc.splitTextToSize(title, maxW - 30).slice(0, 2), margin, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Channel: ${channel}`, margin, 28);
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.setTextColor(210, 210, 210);
  doc.setFontSize(9);
  doc.text(dateStr, pageW - margin, 28, { align: "right" });

  let y = 48;
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Transcript", margin, y); y += 3;
  doc.setDrawColor(180, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y); y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);

  // Split by double newline for paragraphs, single for timestamps
  const isTimestampMode = keepTsEl.checked;
  const sections = fullText.split("\n\n").filter(Boolean);

  for (const section of sections) {
    const lines = doc.splitTextToSize(section, maxW);
    for (const line of lines) {
      if (y + 6 > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y); y += 6;
    }
    // Add paragraph spacing (extra gap between paragraphs)
    if (sections.length > 1) y += 3;
  }

  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text("VerbatimYT by Kowsik Ratnagiri", margin, pageH - 8);
    doc.text(`Page ${i} of ${total}`, pageW - margin, pageH - 8, { align: "right" });
  }
  doc.save(`${title.replace(/[^a-z0-9]/gi, "_").substring(0, 50)}_transcript.pdf`);
}

async function buildDOCX(title, channel, fullText) {
  const { Document, Paragraph, TextRun, HeadingLevel, Packer, BorderStyle } = window.docx;
  const keepTs = keepTsEl.checked;
  let bodyParagraphs;
  if (keepTs) {
    // Timestamp mode — one line per segment
    bodyParagraphs = fullText.split("\n").map(l =>
      new Paragraph({ children: [new TextRun({ text: l, size: 22 })], spacing: { after: 80 } })
    );
  } else if (fullText.includes("\n\n")) {
    // Paragraph mode — already formatted with double newlines
    bodyParagraphs = fullText.split("\n\n").filter(Boolean).map(para =>
      new Paragraph({ children: [new TextRun({ text: para.replace(/\n/g, " "), size: 22 })], spacing: { after: 200 } })
    );
  } else {
    // Raw mode — chunk into paragraphs
    bodyParagraphs = chunkText(fullText, 500).map(c =>
      new Paragraph({ children: [new TextRun({ text: c, size: 22 })], spacing: { after: 120 } })
    );
  }

  const doc = new Document({ sections: [{ properties: {}, children: [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: "Channel: ", bold: true, color: "888888" }), new TextRun({ text: channel, color: "888888" })] }),
    new Paragraph({ children: [new TextRun({ text: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), color: "AAAAAA", size: 18 })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Transcript", heading: HeadingLevel.HEADING_2, border: { bottom: { color: "CC0000", size: 6, style: BorderStyle.SINGLE } } }),
    new Paragraph({ text: "" }),
    ...bodyParagraphs,
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun({ text: "VerbatimYT", bold: true, color: "CC0000", size: 16 }), new TextRun({ text: "  by Kowsik Ratnagiri", color: "AAAAAA", size: 16 })], border: { top: { color: "EEEEEE", size: 4, style: BorderStyle.SINGLE } } }),
  ]}] });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_").substring(0, 50)}_transcript.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildTXT(title, channel, fullText) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const blob = new Blob([[title, "=".repeat(Math.min(title.length,60)), `Channel: ${channel}`, `Date: ${date}`, "Exported with VerbatimYT by Kowsik Ratnagiri", "", "TRANSCRIPT", "-".repeat(40), "", fullText].join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_").substring(0, 50)}_transcript.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function chunkText(text, maxLen) {
  const chunks = [];
  let r = text;
  while (r.length > maxLen) {
    let cut = r.lastIndexOf(". ", maxLen);
    if (cut === -1) cut = maxLen; else cut += 1;
    chunks.push(r.substring(0, cut).trim());
    r = r.substring(cut).trim();
  }
  if (r) chunks.push(r);
  return chunks;
}

// Long press retry button (hold 2s) to trigger debug scan
let retryPressTimer;
document.getElementById("retryBtn").addEventListener("mousedown", () => {
  retryPressTimer = setTimeout(() => debugScan(), 2000);
});
document.getElementById("retryBtn").addEventListener("mouseup", () => {
  clearTimeout(retryPressTimer);
});
document.getElementById("retryBtn").title = "Click to retry | Hold 2s for debug scan";

init();
