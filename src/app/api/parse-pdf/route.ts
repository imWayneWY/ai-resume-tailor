import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
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
    const buffer = Buffer.from(arrayBuffer);
    const result = await pdfParse(buffer);

    const text = result.text.trim();

    if (text.length === 0) {
      return NextResponse.json(
        { error: "Could not extract any text from the PDF. The file may be scanned or image-based." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse PDF. The file may be corrupted or password-protected." },
      { status: 422 }
    );
  }
}
