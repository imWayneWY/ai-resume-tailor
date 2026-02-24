import React from "react";
import { render } from "@testing-library/react";
import { JsonLd } from "../JsonLd";

describe("JsonLd", () => {
  it("renders a script tag with application/ld+json type", () => {
    const data = { "@type": "WebSite", name: "Test" };
    render(<JsonLd data={data} />);
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(script).toBeInTheDocument();
  });

  it("serializes data as JSON in the script content", () => {
    const data = { "@context": "https://schema.org", "@type": "WebSite", name: "My Site" };
    render(<JsonLd data={data} />);
    const script = document.querySelector('script[type="application/ld+json"]');
    const parsed = JSON.parse(script!.textContent!);
    expect(parsed["@type"]).toBe("WebSite");
    expect(parsed.name).toBe("My Site");
  });

  it("escapes angle brackets to prevent XSS", () => {
    const data = { name: "</script><img onerror=alert(1)>" };
    render(<JsonLd data={data} />);
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(script!.innerHTML).not.toContain("</script>");
    // The escaped content should still parse correctly
    const parsed = JSON.parse(script!.textContent!.replace(/\\u003c/g, "<"));
    expect(parsed.name).toContain("</script>");
  });
});
