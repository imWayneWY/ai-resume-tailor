/**
 * @jest-environment node
 */
import { POST } from "../route";

// ---------- mock pdf-parse ----------

jest.mock("pdf-parse", () => {
  return jest.fn();
});

import pdfParse from "pdf-parse";
const mockPdfParse = pdfParse as jest.MockedFunction<typeof pdfParse>;

// ---------- helpers ----------

function makeFormDataRequest(file?: Blob | null, fieldName = "file") {
  const formData = new FormData();
  if (file !== null && file !== undefined) {
    formData.append(fieldName, file);
  }
  return new Request("http://localhost:3000/api/parse-pdf", {
    method: "POST",
    body: formData,
  }) as unknown as import("next/server").NextRequest;
}

function makeInvalidRequest() {
  return new Request("http://localhost:3000/api/parse-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: "not a file" }),
  }) as unknown as import("next/server").NextRequest;
}

function makePdfBlob(content = "fake pdf content", size?: number): Blob {
  const pdfHeader = "%PDF-1.4\n";
  const data = size ? pdfHeader + "a".repeat(size - pdfHeader.length) : pdfHeader + content;
  return new Blob([data], { type: "application/pdf" });
}

// ---------- tests ----------

describe("POST /api/parse-pdf", () => {
  beforeEach(() => {
    mockPdfParse.mockReset();
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();
    // Submit empty form
    const emptyReq = new Request("http://localhost:3000/api/parse-pdf", {
      method: "POST",
      body: formData,
    }) as unknown as import("next/server").NextRequest;

    const res = await POST(emptyReq);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no file provided/i);
  });

  it("returns 400 for non-PDF file type", async () => {
    const textFile = new Blob(["hello"], { type: "text/plain" });
    const res = await POST(makeFormDataRequest(textFile));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/only pdf/i);
  });

  it("returns 400 for empty file", async () => {
    const emptyPdf = new Blob([], { type: "application/pdf" });
    const res = await POST(makeFormDataRequest(emptyPdf));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/file is empty/i);
  });

  it("returns 400 for oversized file (> 10MB)", async () => {
    const bigPdf = makePdfBlob("", 10 * 1024 * 1024 + 1);
    const res = await POST(makeFormDataRequest(bigPdf));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/too large/i);
  });

  it("returns extracted text on successful parse", async () => {
    mockPdfParse.mockResolvedValueOnce({
      text: "John Doe\nSoftware Engineer\n5 years experience",
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      version: "1.0",
    } as Awaited<ReturnType<typeof pdfParse>>);

    const pdf = makePdfBlob();
    const res = await POST(makeFormDataRequest(pdf));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe("John Doe\nSoftware Engineer\n5 years experience");
  });

  it("returns 422 when extracted text is empty", async () => {
    mockPdfParse.mockResolvedValueOnce({
      text: "   ",
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      version: "1.0",
    } as Awaited<ReturnType<typeof pdfParse>>);

    const pdf = makePdfBlob();
    const res = await POST(makeFormDataRequest(pdf));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/could not extract/i);
  });

  it("returns 500 when pdf-parse throws (corrupted file)", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockPdfParse.mockRejectedValueOnce(new Error("Invalid PDF structure"));

    const pdf = makePdfBlob();
    const res = await POST(makeFormDataRequest(pdf));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/failed to parse pdf/i);
    expect(consoleSpy).toHaveBeenCalledWith("Error parsing PDF:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("returns 400 for file without PDF magic bytes", async () => {
    const fakePdf = new Blob(["This is not a PDF"], { type: "application/pdf" });
    const res = await POST(makeFormDataRequest(fakePdf));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/only valid pdf/i);
  });

  it("returns 400 for invalid form data (JSON body instead of multipart)", async () => {
    const res = await POST(makeInvalidRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid form data/i);
  });

  it("trims whitespace from extracted text", async () => {
    mockPdfParse.mockResolvedValueOnce({
      text: "  \n  Hello World  \n  ",
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      version: "1.0",
    } as Awaited<ReturnType<typeof pdfParse>>);

    const pdf = makePdfBlob();
    const res = await POST(makeFormDataRequest(pdf));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe("Hello World");
  });

  it("handles multi-page PDF text correctly", async () => {
    const multiPageText = "Page 1 content\n\nPage 2 content\n\nPage 3 content";
    mockPdfParse.mockResolvedValueOnce({
      text: multiPageText,
      numpages: 3,
      numrender: 3,
      info: {},
      metadata: null,
      version: "1.0",
    } as Awaited<ReturnType<typeof pdfParse>>);

    const pdf = makePdfBlob();
    const res = await POST(makeFormDataRequest(pdf));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe(multiPageText);
  });
});
