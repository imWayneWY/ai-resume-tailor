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
  it("renders the hero headline", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", {
        name: /tailor your resume for any job in seconds/i,
      })
    ).toBeInTheDocument();
  });

  it("renders the hero subtitle", () => {
    render(<Home />);
    expect(
      screen.getByText(/ai matches your resume to the job description/i)
    ).toBeInTheDocument();
  });

  it("renders a Get Started link pointing to /tailor", () => {
    render(<Home />);
    const link = screen.getByRole("link", { name: /get started/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/tailor");
  });

  it("renders the How It Works section", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /how it works/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /upload your resume/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /paste the job description/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /get your tailored resume/i })
    ).toBeInTheDocument();
  });

  it("renders the features section", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /everything you need/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /ats keyword matching/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /match score/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /pdf download/i })
    ).toBeInTheDocument();
  });

  it("renders the bottom CTA section", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /ready to tailor your resume/i })
    ).toBeInTheDocument();
    const ctaLink = screen.getByRole("link", { name: /try it free/i });
    expect(ctaLink).toHaveAttribute("href", "/tailor");
  });

  it("renders JSON-LD structured data", () => {
    render(<Home />);
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(script).toBeInTheDocument();
    const data = JSON.parse(script!.textContent!);
    expect(data["@type"]).toBe("WebApplication");
    expect(data.name).toBe("AI Resume Tailor");
  });
});
