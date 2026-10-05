"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/**
 * Browser Speech-to-Text only (SYSTEM_SPEC §13). There is no server STT/TTS
 * dependency, and the button is hidden with an explanatory note when the
 * browser has no Web Speech API support.
 */
function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function MicButton({
  onTranscript,
  disabled = false,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const supported = getRecognitionConstructor() !== null;

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    },
    [],
  );

  if (!supported) {
    return (
      <p className="text-xs text-ink-subtle">
        Trình duyệt này không hỗ trợ Web Speech API, hãy nhập lệnh bằng văn bản.
      </p>
    );
  }

  const toggle = () => {
    setError(null);
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Recognition = getRecognitionConstructor();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) onTranscript(result[0].transcript);
      }
    };
    recognition.onerror = (event) => {
      setError(`Lỗi nhận dạng giọng nói: ${event.error}`);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={listening ? "danger" : "secondary"}
        size="sm"
        disabled={disabled}
        aria-pressed={listening}
        onClick={toggle}
        icon={
          listening ? (
            <MicOff size={14} strokeWidth={1.75} aria-hidden />
          ) : (
            <Mic size={14} strokeWidth={1.75} aria-hidden />
          )
        }
      >
        {listening ? "Đang nghe..." : "Nói"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}