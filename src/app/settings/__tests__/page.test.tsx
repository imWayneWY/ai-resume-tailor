import { render, screen } from "@testing-library/react";
import SettingsPage from "../page";

describe("SettingsPage", () => {
  it("renders the page heading", () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: /settings/i })
    ).toBeInTheDocument();
  });

  it("shows that Azure OpenAI is configured", () => {
    render(<SettingsPage />);
    expect(screen.getAllByText(/Azure OpenAI/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/no API key needed/i)).toBeInTheDocument();
  });

  it("mentions GPT-4.1-mini model", () => {
    render(<SettingsPage />);
    expect(screen.getByText(/GPT-4.1-mini/i)).toBeInTheDocument();
  });

  it("does not render any API key inputs", () => {
    render(<SettingsPage />);
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
  });

  it("does not render provider selector", () => {
    render(<SettingsPage />);
    expect(screen.queryByLabelText(/model provider/i)).not.toBeInTheDocument();
  });

  it("does not render Save or Clear buttons", () => {
    render(<SettingsPage />);
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });
});
