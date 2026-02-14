import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/link
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Mock next/navigation
const mockUsePathname = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

import { Navbar } from "../Navbar";

describe("Navbar", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
  });

  it("renders brand link to home", () => {
    mockUsePathname.mockReturnValue("/");
    render(<Navbar />);
    const brandLink = screen.getByText("AI Resume Tailor");
    expect(brandLink.closest("a")).toHaveAttribute("href", "/");
  });

  it("renders settings link", () => {
    mockUsePathname.mockReturnValue("/");
    render(<Navbar />);
    const settingsLink = screen.getByLabelText("Settings");
    expect(settingsLink).toHaveAttribute("href", "/settings");
  });

  it("shows Get Started button on home page", () => {
    mockUsePathname.mockReturnValue("/");
    render(<Navbar />);
    const getStarted = screen.getByText("Get Started");
    expect(getStarted.closest("a")).toHaveAttribute("href", "/tailor");
  });

  it("shows Get Started button on settings page", () => {
    mockUsePathname.mockReturnValue("/settings");
    render(<Navbar />);
    const getStarted = screen.getByText("Get Started");
    expect(getStarted.closest("a")).toHaveAttribute("href", "/tailor");
  });

  it("hides Get Started button on /tailor page", () => {
    mockUsePathname.mockReturnValue("/tailor");
    render(<Navbar />);
    expect(screen.queryByText("Get Started")).toBeNull();
  });

  it("hides Get Started button on /tailor/result page", () => {
    mockUsePathname.mockReturnValue("/tailor/result");
    render(<Navbar />);
    expect(screen.queryByText("Get Started")).toBeNull();
  });
});
