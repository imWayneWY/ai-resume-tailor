import { render, screen, fireEvent } from "@testing-library/react";
import { UserMenu } from "../UserMenu";
import type { User } from "@supabase/supabase-js";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "test-user-123",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as User;
}

describe("UserMenu", () => {
  it("renders user email initial in avatar", () => {
    render(<UserMenu user={makeUser()} credits={5} />);
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("shows email in trigger button on desktop", () => {
    render(<UserMenu user={makeUser()} credits={5} />);
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("shows credit count in navbar badge", () => {
    render(<UserMenu user={makeUser()} credits={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("opens dropdown on click", () => {
    render(<UserMenu user={makeUser()} credits={5} />);
    const trigger = screen.getByRole("button", { expanded: false });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: /user menu/i })).toBeInTheDocument();
  });

  it("shows credits in dropdown", () => {
    render(<UserMenu user={makeUser()} credits={5} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Credits")).toBeInTheDocument();
    // "5" appears in both navbar badge and dropdown — verify both exist
    const fives = screen.getAllByText("5");
    expect(fives).toHaveLength(2);
  });

  it("shows zero credits with appropriate label", () => {
    render(<UserMenu user={makeUser()} credits={0} />);
    fireEvent.click(screen.getByRole("button"));
    // Verify zero credits are displayed in the dropdown
    const creditValues = screen.getAllByText("0");
    expect(creditValues.length).toBeGreaterThanOrEqual(1);
    // Verify the navbar badge has an accessible label indicating no credits
    const badge = screen.getByLabelText(/no credits remaining/i);
    expect(badge).toBeInTheDocument();
  });

  it("has History link", () => {
    render(<UserMenu user={makeUser()} credits={5} />);
    fireEvent.click(screen.getByRole("button"));
    const historyLink = screen.getByRole("link", { name: /history/i });
    expect(historyLink).toHaveAttribute("href", "/history");
  });

  it("has Settings link", () => {
    render(<UserMenu user={makeUser()} credits={5} />);
    fireEvent.click(screen.getByRole("button"));
    const settingsLink = screen.getByRole("link", { name: /settings/i });
    expect(settingsLink).toHaveAttribute("href", "/settings");
  });

  it("has Sign out button", () => {
    render(<UserMenu user={makeUser()} credits={5} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    render(<UserMenu user={makeUser()} credits={5} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog", { name: /user menu/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /user menu/i })).not.toBeInTheDocument();
  });

  it("closes on outside click", () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <UserMenu user={makeUser()} credits={5} />
      </div>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog", { name: /user menu/i })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("dialog", { name: /user menu/i })).not.toBeInTheDocument();
  });

  it("hides credits section when credits is null", () => {
    render(<UserMenu user={makeUser()} credits={null} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Credits")).not.toBeInTheDocument();
  });
});
