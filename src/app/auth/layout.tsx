import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign In | AI Resume Tailor",
  description: "Sign in to your AI Resume Tailor account.",
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
