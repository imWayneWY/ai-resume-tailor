import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { normalizeResumeText } from "@/lib/resume-text-normalizer";

/**
 * SECURITY NOTE: This endpoint is intentionally public (no auth required).
 * Unauthenticated users need PDF parsing for the resume upload preview flow
 * before they sign up. It is protected by IP-based rate limiting (10 req/min).
 * The endpoint performs CPU-only work (no external API calls) so the abuse
 * cost is lower than the AI endpoints, but rate limiting still prevents DoS.
 */

const rateLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  // Rate limiting — 10 requests per minute per IP
  const clientIp = getClientIp(request);
  const rateLimitResult = rateLimiter.check(clientIp);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files are accepted" },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: "File is empty" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File is too large (max 10MB)" },
      { status: 400 }
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Validate PDF magic bytes ("%PDF-") to ensure the file is actually a PDF
    const pdfMagic = String.fromCharCode(...data.subarray(0, 5));
    if (pdfMagic !== "%PDF-") {
      return NextResponse.json(
        { error: "Only valid PDF files are accepted" },
        { status: 400 }
      );
    }

    const pdf = await getDocumentProxy(data);

    let rawText: string;
    try {
      rawText = await extractTextPreservingLines(pdf);
    } catch (perItemError) {
      // Per-item positioning extraction failed for some reason (e.g. an
      // unusual PDF structure) — degrade gracefully to the previous
      // mergePages:true behavior rather than erroring out the whole upload.
      console.error("Per-item line extraction failed, falling back to extractText(mergePages:true):", perItemError);
      const { text } = await extractText(pdf, { mergePages: true });
      rawText = text;
    }

    const trimmedText = normalizeResumeText(rawText).trim();

    if (trimmedText.length === 0) {
      return NextResponse.json(
        { error: "Could not extract any text from the PDF. The file may be scanned or image-based." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text: trimmedText });
  } catch (error) {
    console.error("Error parsing PDF:", error);
    return NextResponse.json(
      { error: "Failed to parse PDF." },
      { status: 500 }
    );
  }
}

interface PdfTextItemLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

/**
 * Builds text with real line structure from pdf.js-style text items, using
 * the y-coordinate (transform[5]) to detect line breaks instead of relying
 * on unpdf's extractText({ mergePages: true }), which flattens the whole
 * page into one string. Starts a new line when y changes by more than
 * about half the font height, adds a blank line for larger gaps, and joins
 * items within a line with a space when there's a horizontal gap between
 * them.
 */
async function extractTextPreservingLines(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>
): Promise<string> {
  const numPages: number = pdf.numPages;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = (content.items as PdfTextItemLike[]).filter(
      (item): item is PdfTextItemLike & { str: string; transform: number[] } =>
        !!item.str && Array.isArray(item.transform) && item.transform.length >= 6
    );

    if (items.length === 0) {
      pageTexts.push("");
      continue;
    }

    const lines: { y: number; height: number; parts: { x: number; str: string }[] }[] = [];

    for (const item of items) {
      const x = item.transform[4];
      const y = item.transform[5];
      const height = Math.abs(item.height || item.transform[3] || 10) || 10;

      const line = lines[lines.length - 1];
      if (line && Math.abs(line.y - y) <= Math.max(2, height * 0.5)) {
        line.parts.push({ x, str: item.str });
        continue;
      }

      // Larger vertical gap -> insert a blank line to preserve visual
      // paragraph/section spacing.
      if (line && Math.abs(line.y - y) > height * 2.5) {
        lines.push({ y, height, parts: [] });
      }

      lines.push({ y, height, parts: [{ x, str: item.str }] });
    }

    const pageLines = lines.map((line) => {
      if (line.parts.length === 0) return "";
      const sorted = [...line.parts].sort((a, b) => a.x - b.x);
      let out = "";
      let prev: { x: number; str: string } | null = null;
      for (const part of sorted) {
        if (prev) {
          const approxCharWidth = Math.max(1, line.height * 0.5);
          const gap = part.x - prev.x;
          const needsSpace = gap > approxCharWidth * 0.6 && !out.endsWith(" ") && !part.str.startsWith(" ");
          if (needsSpace) out += " ";
        }
        out += part.str;
        prev = part;
      }
      return out.trim();
    });

    pageTexts.push(pageLines.join("\n"));
  }

  return pageTexts.join("\n\n");
}
