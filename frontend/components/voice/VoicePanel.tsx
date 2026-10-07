"use client";

import { CheckCircle2, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { MicButton } from "@/components/voice/MicButton";
import { ApiError, sendVoiceCommand } from "@/lib/api";
import { useCommandTracker } from "@/lib/hooks/useCommandTracker";
import { commandStatusLabel } from "@/lib/format";

const EXAMPLES = ["Bật đèn phòng khách", "Tắt đèn phòng ngủ", "Nhiệt độ phòng khách bao nhiêu?", "Độ ẩm phòng ngủ hiện tại bao nhiêu?"];

function findVietnameseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const vietnamese = voices.filter((voice) => {
    const language = voice.lang.replaceAll("_", "-").toLowerCase();
    return language === "vi" || language.startsWith("vi-");
  });
  return vietnamese.find((voice) => voice.lang.replaceAll("_", "-").toLowerCase() === "vi-vn") ?? vietnamese[0] ?? null;
}

interface Exchange {
  id: number;
  said: string;
  reply: string;
  failed: boolean;
}

interface ProgressLine {
  label: string;
  detail: string;
  tone: "neutral" | "info" | "ok" | "bad" | "warn";
  icon: typeof Loader2;
}

export function VoicePanel({ variant = "page" }: { variant?: "page" | "drawer" }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [vietnameseVoice, setVietnameseVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const tracker = useCommandTracker();

  useEffect(() => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      const timer = setTimeout(() => setSpeechAvailable(false), 0);
      return () => clearTimeout(timer);
    }

    const synthesis = window.speechSynthesis;
    const updateVoices = () => {
      setVietnameseVoice(findVietnameseVoice(synthesis.getVoices()));
      setSpeechAvailable(true);
    };
    const timer = window.setTimeout(updateVoices, 0);
    synthesis.addEventListener("voiceschanged", updateVoices);
    return () => {
      window.clearTimeout(timer);
      synthesis.removeEventListener("voiceschanged", updateVoices);
    };
  }, []);

  const speak = (message: string) => {
    if (!speakReplies || typeof window === "undefined" || !("speechSynthesis" in window)
      || typeof SpeechSynthesisUtterance === "undefined") return;
    setSpeechError(null);
    try {
      const voice = findVietnameseVoice(window.speechSynthesis.getVoices()) ?? vietnameseVoice;
      if (!voice) {
        setSpeechError("Máy chưa có giọng đọc tiếng Việt. Hãy cài giọng TTS tiếng Việt rồi tải lại trang; trang sẽ không đọc bằng giọng Anh.");
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = "vi-VN";
      utterance.voice = voice;
      utterance.onerror = (event) => {
        if (event.error !== "canceled" && event.error !== "interrupted") {
          setSpeechError(`Không phát được âm thanh (${event.error}). Hãy kiểm tra giọng đọc và âm lượng của thiết bị.`);
        }
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeechError("Trình duyệt không phát được âm thanh. Hãy kiểm tra quyền âm thanh và giọng đọc của thiết bị.");
    }
  };

  const submit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || submitting || tracker.busy) return;
    tracker.reset();
    setSubmitting(true);
    setError(null);
    try {
      const result = await sendVoiceCommand(trimmed);
      const message = result.message ?? "Không có phản hồi.";
      setExchanges((current) => [
        ...current,
        {
          id: Date.now(),
          said: trimmed,
          reply: message,
          failed: !result.success && !result.commandId,
        },
      ]);
      speak(message);
      if (!result.success) {
        if (result.commandId) tracker.track(result.commandId);
        else setError(message);
        return;
      }
    } catch (cause) {
      setExchanges((current) => [
        ...current,
        { id: Date.now(), said: trimmed, reply: "Không gửi được lệnh.", failed: true },
      ]);
      setError(cause instanceof ApiError ? cause.message : "Không gửi được lệnh giọng nói.");
    } finally {
      setSubmitting(false);
    }
  };

  const progress = ((): ProgressLine | null => {
    switch (tracker.status) {
      case "sending":
        return {
          label: "Đang gửi lệnh",
          detail: "Chờ máy chủ tạo lệnh.",
          tone: "neutral",
          icon: Loader2,
        };
      case "waiting":
        return {
          label: "Đang chờ thiết bị",
          detail: `Lệnh ${tracker.commandStatus ? commandStatusLabel(tracker.commandStatus) : "đang chờ"}.`,
          tone: "info",
          icon: Loader2,
        };
      case "success":
        return {
          label: "Thiết bị đã xác nhận",
          detail: "Trạng thái đã được ghi nhận.",
          tone: "ok",
          icon: CheckCircle2,
        };
      case "failed":
        return {
          label: "Lệnh không thực hiện được",
          detail: tracker.error ?? "Thiết bị báo lỗi.",
          tone: "bad",
          icon: XCircle,
        };
      case "timeout":
        return {
          label: "Chưa có xác nhận",
          detail: `${tracker.error ?? "Thiết bị không phản hồi."} Trạng thái vẫn chưa chắc chắn.`,
          tone: "warn",
          icon: TriangleAlert,
        };
      default:
        return null;
    }
  })();

  const progressTone: Record<ProgressLine["tone"], string> = {
    neutral: "text-ink-muted",
    info: "text-info",
    ok: "text-ok",
    bad: "text-bad",
    warn: "text-warn",
  };

  const ProgressIcon = progress?.icon ?? null;

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(text);
        }}
      >
        <TextField
          label="Lệnh của bạn"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Bật đèn phòng khách"
          hint="Bật/tắt relay theo tên, hoặc hỏi nhiệt độ và độ ẩm của một phòng."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={submitting || tracker.busy}>
            {submitting ? <Spinner label="Đang gửi" /> : null} Gửi lệnh
          </Button>
          <MicButton
            disabled={submitting}
            onTranscript={(transcript) => {
              setText(transcript);
              void submit(transcript);
            }}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={speakReplies}
            disabled={speechAvailable === false}
            onChange={(event) => {
              setSpeakReplies(event.target.checked);
              if (!event.target.checked && "speechSynthesis" in window) window.speechSynthesis.cancel();
            }}
          />
          Đọc câu trả lời bằng tiếng Việt
        </label>
        <Button variant="secondary" size="sm" disabled={!speakReplies || speechAvailable === false} onClick={() => speak("Xin chào, tôi là trợ lý nhà thông minh.")}>
          Thử giọng
        </Button>
        {speechError && <p role="alert" className="text-xs text-bad">{speechError}</p>}
        {speechAvailable === false ? (
          <p className="text-xs text-ink-subtle">Trình duyệt này không hỗ trợ đọc câu trả lời thành tiếng.</p>
        ) : speechAvailable && !vietnameseVoice ? (
          <p className="text-xs text-ink-subtle">Máy chưa có giọng đọc tiếng Việt. Cài giọng TTS tiếng Việt trên thiết bị rồi tải lại trang; trang sẽ không dùng giọng Anh.</p>
        ) : vietnameseVoice ? (
          <p className="text-xs text-ink-subtle">Giọng đọc: {vietnameseVoice.name} ({vietnameseVoice.lang}).</p>
        ) : null}
      </form>

      <div>
        <p className="text-xs text-ink-subtle">Ví dụ câu lệnh</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
              className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {progress && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-muted px-3.5 py-3"
        >
          {ProgressIcon && (
            <ProgressIcon
              size={16}
              strokeWidth={1.75}
              className={`mt-0.5 shrink-0 ${progressTone[progress.tone]}`}
              aria-hidden
            />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-medium ${progressTone[progress.tone]}`}>{progress.label}</p>
            <p className="text-xs text-ink-subtle">{progress.detail}</p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      {exchanges.length > 0 && (
        <div
          className={`space-y-3 border-t border-line pt-4 ${variant === "drawer" ? "" : "max-h-72 overflow-y-auto"}`}
          aria-label="Lịch sử hội thoại"
        >
          {exchanges.map((exchange) => (
            <div key={exchange.id} className="space-y-2">
              <div className="flex justify-start">
                <p className="max-w-[85%] rounded-lg rounded-tl-sm bg-surface-muted px-3 py-2 text-sm text-ink">
                  {exchange.said}
                </p>
              </div>
              <div className="flex justify-end">
                <p
                  className={`max-w-[85%] rounded-lg rounded-tr-sm px-3 py-2 text-sm ${
                    exchange.failed
                      ? "bg-bad-subtle text-bad"
                      : "bg-accent-subtle text-accent"
                  }`}
                >
                  {exchange.reply}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
