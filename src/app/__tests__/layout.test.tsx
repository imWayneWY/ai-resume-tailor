import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/link to render a plain anchor
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

// Mock globals.css
jest.mock("../globals.css", () => ({}));

describe("Layout", () => {
  it("exports metadata with correct title and description", async () => {
    const { metadata } = await import("../layout");
    expect(metadata.title).toBe("AI Resume Tailor");
    expect(metadata.description).toMatch(/tailor your resume/i);
  });

  it("exports metadata with openGraph", async () => {
    const { metadata } = await import("../layout");
    const og = metadata.openGraph as {
      title: string;
      description: string;
      type: string;
    };
    expect(og.title).toBe("AI Resume Tailor");
    expect(og.type).toBe("website");
  });

  it("default export is a function (React component)", async () => {
    const { default: RootLayout } = await import("../layout");
    expect(typeof RootLayout).toBe("function");
  });

  it("renders navbar and footer with children", async () => {
    const { default: RootLayout } = await import("../layout");

    // RootLayout renders <html>/<body> which causes jsdom warnings.
    // Suppress console.error for this test, and render into a custom container.
    const originalError = console.error;
    console.error = jest.fn();

    try {
      const { container } = render(
        <RootLayout>
          <div data-testid="child">Test Child</div>
        </RootLayout>,
        { container: document.createElement("div") }
      );

      // Check nav exists
      const nav = container.querySelector("nav");
      expect(nav).toBeTruthy();

      // Check brand link
      const links = container.querySelectorAll("a");
      const brandLink = Array.from(links).find((a) =>
        a.textContent?.includes("AI Resume Tailor")
      );
      expect(brandLink).toBeTruthy();
      expect(brandLink?.getAttribute("href")).toBe("/");

      // Check "Get Started" link in navbar
      const getStartedLink = Array.from(links).find((a) =>
        a.textContent?.includes("Get Started")
      );
      expect(getStartedLink).toBeTruthy();
      expect(getStartedLink?.getAttribute("href")).toBe("/tailor");

      // Check Settings link in navbar
      const settingsLink = Array.from(links).find(
        (a) => a.getAttribute("href") === "/settings"
      );
      expect(settingsLink).toBeTruthy();

      // Check footer
      const footer = container.querySelector("footer");
      expect(footer).toBeTruthy();
      expect(footer?.textContent).toMatch(/built with ai/i);

      // Check children are rendered
      expect(
        container.querySelector('[data-testid="child"]')
      ).toBeTruthy();
    } finally {
      console.error = originalError;
    }
  });
});
