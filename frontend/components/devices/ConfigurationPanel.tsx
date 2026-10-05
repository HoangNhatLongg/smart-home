"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { TextField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/StatusBadge";
import { ApiError, updateConfiguration, updateDeviceName } from "@/lib/api";
import type { Device, DeviceConfiguration } from "@/lib/api/contract";
import { formatDateTime } from "@/lib/format";

/** Order-insensitive comparison of two flat configuration objects. */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
};

export function ConfigurationPanel({
  device,
  configuration,
  onRefresh,
}: {
  device: Device;
  configuration: DeviceConfiguration | null;
  onRefresh: () => void;
}) {
  const [name, setName] = useState(device.name);
  const [interval, setInterval] = useState("30");
  const [relayName, setRelayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const desired = configuration?.desired ?? {};
  const applied = configuration?.applied ?? null;
  const desiredInterval =
    typeof desired.telemetry_interval === "number" ? String(desired.telemetry_interval) : "30";

  const relayNameKey = device.capabilities.find((capability) => capability.code === "relay")
    ?.instanceCode;
  const currentRelayName = desired[relayNameKey ? `${relayNameKey}_name` : ""];
  const seededRelayName = typeof currentRelayName === "string" ? currentRelayName : "";

  // Re-seed the editable fields when the Device or the desired config changes.
  const sourceKey = `${device.deviceId}|${device.name}|${desiredInterval}|${seededRelayName}`;
  const [seededKey, setSeededKey] = useState(sourceKey);
  if (seededKey !== sourceKey) {
    setSeededKey(sourceKey);
    setName(device.name);
    setInterval(desiredInterval);
    setRelayName(seededRelayName);
  }

  const applying = useMemo(() => {
    if (!configuration) return false;
    return stableStringify(configuration.desired) !== stableStringify(configuration.applied);
  }, [configuration]);

  const onSaveName = async () => {
    setSavingName(true);
    setMessage(null);
    try {
      await updateDeviceName(device.deviceId, name.trim());
      setMessage({ tone: "ok", text: "Đã cập nhật tên thiết bị." });
      onRefresh();
    } catch (cause) {
      setMessage({
        tone: "bad",
        text: cause instanceof ApiError ? cause.message : "Không cập nhật được tên thiết bị.",
      });
    } finally {
      setSavingName(false);
    }
  };

  const onSaveConfiguration = async () => {
    const parsed = Number(interval);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage({ tone: "bad", text: "Chu kỳ gửi số đo phải là số giây lớn hơn 0." });
      return;
    }
    setSavingConfig(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = { telemetry_interval: Math.round(parsed) };
      if (relayNameKey) {
        const nextRelayName = relayName.trim() || seededRelayName;
        if (nextRelayName) payload[`${relayNameKey}_name`] = nextRelayName;
      }
      await updateConfiguration(device.deviceId, payload);
      setMessage({
        tone: "ok",
        text: "Đã gửi cấu hình, thiết bị sẽ áp dụng ở lần đồng bộ kế tiếp.",
      });
      onRefresh();
    } catch (cause) {
      setMessage({
        tone: "bad",
        text: cause instanceof ApiError ? cause.message : "Không cập nhật được cấu hình.",
      });
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <p
          role="status"
          className={`text-sm ${message.tone === "ok" ? "text-ok" : "text-bad"}`}
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Thông tin chung" description="Tên hiển thị của thiết bị trong bảng điều khiển.">
          <div className="space-y-3">
            <TextField
              label="Tên thiết bị"
              value={name}
              onChange={(event) => setName(event.target.value)}
              hint={`Mã thiết bị: ${device.deviceId}`}
            />
            <Button onClick={onSaveName} disabled={savingName || name.trim() === ""}>
              {savingName ? <Spinner label="Đang lưu" /> : null} Lưu tên
            </Button>
          </div>
        </Section>

        <Section
          title="Chu kỳ gửi số đo"
          description="Thiết bị gửi nhiệt độ và độ ẩm theo chu kỳ này."
          actions={<Badge tone="neutral">{configuration?.configVersion ?? "—"}</Badge>}
        >
          <div className="space-y-3">
            <TextField
              label="Khoảng cách giữa hai lần gửi (giây)"
              type="number"
              min={1}
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
              hint="Thiết bị nhận cấu hình ở chu kỳ đồng bộ kế tiếp."
            />
            <Button onClick={onSaveConfiguration} disabled={savingConfig}>
              {savingConfig ? <Spinner label="Đang gửi" /> : null} Gửi cấu hình
            </Button>
          </div>
        </Section>

        {relayNameKey && (
          <Section
            title="Tên rơ-le"
            description="Tên hiển thị của công tắc trên thiết bị này."
          >
            <TextField
              label={`Tên ${relayNameKey}`}
              value={relayName}
              onChange={(event) => setRelayName(event.target.value)}
              placeholder="Đèn phòng khách"
              hint="Lưu cùng nút “Gửi cấu hình” ở trên."
            />
          </Section>
        )}

        <Section
          title="Trạng thái áp dụng"
          description="So sánh cấu hình bạn đặt với cấu hình thiết bị đang dùng."
          actions={
            <Badge tone={applying ? "warn" : "ok"}>{applying ? "Đang áp dụng" : "Khớp"}</Badge>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-line bg-surface-muted p-3">
              <p className="text-xs text-ink-subtle">Bạn đặt</p>
              <pre className="mt-1 overflow-x-auto text-xs text-ink">
                {JSON.stringify(desired, null, 2)}
              </pre>
            </div>
            <div className="rounded-md border border-line bg-surface-muted p-3">
              <p className="text-xs text-ink-subtle">Thiết bị đang dùng</p>
              <pre className="mt-1 overflow-x-auto text-xs text-ink">
                {applied ? JSON.stringify(applied, null, 2) : "Chưa có"}
              </pre>
            </div>
          </div>
          <p className="mt-2.5 text-xs text-ink-subtle">
            {applying
              ? "Thiết bị chưa báo đã áp dụng xong. Trạng thái sẽ khớp sau chu kỳ đồng bộ kế tiếp."
              : `Cấu hình đã khớp · áp dụng lúc ${formatDateTime(configuration?.appliedAt ?? null)}`}
          </p>
        </Section>
      </div>
    </div>
  );
}