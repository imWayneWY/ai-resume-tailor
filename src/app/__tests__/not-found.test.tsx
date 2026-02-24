import React, { type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import NotFound from "../not-found";

jest.mock("next/link", () => ({
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
}));

describe("NotFound page", () => {
  it("renders 404 text", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders page not found heading", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("heading", { name: /page not found/i })
    ).toBeInTheDocument();
  });

  it("renders Go Home link", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /go home/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders Tailor a Resume link", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /tailor a resume/i });
    expect(link).toHaveAttribute("href", "/tailor");
  });

  it("exports metadata with title", async () => {
    const { metadata } = await import("../not-found");
    expect(metadata.title).toBe("Page Not Found");
  });
});
