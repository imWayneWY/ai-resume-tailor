import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

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
    const { text } = await extractText(pdf, { mergePages: true });

    const trimmedText = text.trim();

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
