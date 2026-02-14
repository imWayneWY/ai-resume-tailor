import React, { type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import Home from "../page";

// Mock next/link to render a plain anchor
jest.mock("next/link", () => {
  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: ReactNode;
      [key: string]: unknown;
    }) => (
      <a href={href} {...rest}>
        {children}
      </a>
    ),
  };
});

describe("Home page", () => {
  it("renders the headline", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /tailor your resume in seconds/i })
    ).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<Home />);
    expect(
      screen.getByText(/paste your resume and a job description/i)
    ).toBeInTheDocument();
  });

  it("renders a Get Started link pointing to /tailor", () => {
    render(<Home />);
    const link = screen.getByRole("link", { name: /get started/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/tailor");
  });
});
