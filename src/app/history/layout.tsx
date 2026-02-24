import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Usage History",
  description: "View your resume tailoring history and match score improvements.",
};

export default function HistoryLayout({ children }: { children: ReactNode }) {
  return children;
}
