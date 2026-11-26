import React from "react";
import { render, screen } from "@testing-library/react";
import ChangesDiff, { type Change } from "@/components/ChangesDiff";

describe("ChangesDiff", () => {
  const noop = () => {};

  it("renders nothing when there are no changes", () => {
    const { container } = render(
      <ChangesDiff changes={[]} onAccept={noop} onReject={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows a large-deletion warning badge when a full sentence was dropped", () => {
    const changes: Change[] = [
      {
        section: "Experience",
        original:
          "Developed a multi-method checkout flow supporting credit card, WeChat Pay and Alipay. Improved conversion for the platform's core transaction pipeline.",
        revised:
          "Developed a multi-method checkout flow supporting credit card, WeChat Pay and Alipay.",
        reason: "Tightened wording.",
        jdTermsUsed: [],
      },
    ];
    render(<ChangesDiff changes={changes} onAccept={noop} onReject={noop} />);
    expect(screen.getByText(/Large deletion/i)).toBeInTheDocument();
  });

  it("does not show a large-deletion warning for a pure adjective removal", () => {
    const changes: Change[] = [
      {
        section: "Experience",
        original: "Built high-impact features for the team.",
        revised: "Built features for the team.",
        reason: "Removed subjective adjective.",
        jdTermsUsed: [],
      },
    ];
    render(<ChangesDiff changes={changes} onAccept={noop} onReject={noop} />);
    expect(screen.queryByText(/Large deletion/i)).not.toBeInTheDocument();
  });
});
