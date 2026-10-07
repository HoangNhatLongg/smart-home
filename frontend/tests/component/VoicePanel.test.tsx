import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { VoicePanel } from "@/components/voice/VoicePanel";

afterEach(() => vi.unstubAllGlobals());

it("never substitutes an English voice when the browser has no Vietnamese voice", async () => {
  const speak = vi.fn();
  const synthesis = {
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    speak,
  };
  class Utterance {
    lang = "";
    voice = null;
    onerror = null;
    constructor(public text: string) {}
  }
  vi.stubGlobal("speechSynthesis", synthesis);
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);

  render(<VoicePanel />);
  const option = screen.getByRole("checkbox", { name: "Đọc câu trả lời bằng tiếng Việt" });
  await waitFor(() => expect(screen.getByText(/Máy chưa có giọng đọc tiếng Việt/)).toBeInTheDocument());
  expect(option).toBeEnabled();
  expect(option).toBeChecked();

  await userEvent.click(screen.getByRole("button", { name: "Thử giọng" }));
  expect(speak).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Máy chưa có giọng đọc tiếng Việt");
});

it("selects an actual Vietnamese voice when one is installed", async () => {
  const speak = vi.fn();
  const vietnameseVoice = { lang: "vi-VN", name: "Microsoft An" };
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => [{ lang: "en-US", name: "English" }, vietnameseVoice],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    speak,
  });
  class Utterance {
    lang = "";
    voice = null;
    onerror = null;
    constructor(public text: string) {}
  }
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);

  render(<VoicePanel />);
  await waitFor(() => expect(screen.getByText(/Giọng đọc: Microsoft An/)).toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: "Thử giọng" }));
  expect(speak).toHaveBeenCalledOnce();
  expect(speak.mock.calls[0][0]).toMatchObject({
    lang: "vi-VN",
    voice: vietnameseVoice,
    text: "Xin chào, tôi là trợ lý nhà thông minh.",
  });
});
