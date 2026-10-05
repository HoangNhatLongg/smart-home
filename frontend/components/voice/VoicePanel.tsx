"use client";

import { CheckCircle2, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { MicButton } from "@/components/voice/MicButton";
import { ApiError, sendVoiceCommand } from "@/lib/api";
import { useCommandTracker } from "@/lib/hooks/useCommandTracker";
import { commandStatusLabel } from "@/lib/format";

const EXAMPLES = ["Bật đèn phòng khách", "Tắt đèn phòng ngủ"];

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
  const tracker = useCommandTracker();

  const submit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await sendVoiceCommand(trimmed);
      setExchanges((current) => [
        ...current,
        {
          id: Date.now(),
          said: trimmed,
          reply: result.message ?? "Không có phản hồi.",
          failed: !result.success,
        },
      ]);
      if (!result.success) {
        setError("Không phân tích được yêu cầu này.");
        return;
      }
      // success:true only means the intent was resolved. The device has not
      // confirmed anything yet (SYSTEM_SPEC rule 8).
      if (result.commandId) tracker.track(result.commandId);
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
          hint="Chỉ hỗ trợ bật/tắt thiết bị đã đăng ký trong nhà."
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
          {(() => {
            const Icon = progress.icon;
            return <Icon size={16} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${progressTone[progress.tone]}`} aria-hidden />;
          })()}
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