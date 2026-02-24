import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Tailor Your Resume | AI Resume Tailor",
  description:
    "Upload your resume and job description. AI tailors it for ATS optimization in seconds.",
};

export default function TailorLayout({ children }: { children: ReactNode }) {
  return children;
}
