"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, createAutomation, updateAutomation } from "@/lib/api";
import type { Automation, Device } from "@/lib/api/contract";

interface RelayOption {
  deviceId: string;
  deviceName: string;
  instanceCode: string;
  label: string;
}

export interface AutomationFormProps {
  homeId: string;
  devices: Device[];
  automation?: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * MVP automation is schedule-based and `daily` only (SYSTEM_SPEC §11), and the
 * action can only drive a relay instance. No threshold UI.
 */
export function AutomationForm({ homeId, devices, automation, onClose, onSaved }: AutomationFormProps) {
  const options = useMemo<RelayOption[]>(
    () =>
      devices.flatMap((device) =>
        device.capabilities
          .filter((capability) => capability.code === "relay")
          .map((capability) => ({
            deviceId: device.deviceId,
            deviceName: device.name,
            instanceCode: capability.instanceCode,
            label: `${capability.name ?? capability.instanceCode} · ${device.name} (${capability.instanceCode})`,
          })),
      ),
    [devices],
  );

  const [name, setName] = useState(automation?.name ?? "");
  const [time, setTime] = useState(automation?.schedule.time ?? "18:00");
  const [enabled, setEnabled] = useState(automation?.enabled ?? true);
  const [optionKey, setOptionKey] = useState(
    automation ? `${automation.action.deviceId}::${automation.action.capability}` : "",
  );
  const [state, setState] = useState(
    automation?.action.params.state === false ? "false" : "true",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const selected = options.find(
      (option) => `${option.deviceId}::${option.instanceCode}` === optionKey,
    );
    if (!selected) {
      setError("Hãy chọn thiết bị và công tắc cần điều khiển.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError("Giờ phải có định dạng HH:MM.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        enabled,
        schedule: { type: "daily" as const, time },
        action: {
          deviceId: selected.deviceId,
          capability: selected.instanceCode,
          command: "set_relay",
          params: { state: state === "true" },
        },
      };
      if (automation) await updateAutomation(automation.id, payload);
      else await createAutomation(homeId, payload);
      onSaved();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Không lưu được lịch.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <TextField
        label="Tên lịch"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        hint="Tên bạn nhìn thấy trong danh sách, ví dụ “Đèn ngủ tắt khi đi ngủ”."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Giờ chạy"
          type="time"
          required
          value={time}
          onChange={(event) => setTime(event.target.value)}
          hint="Lịch lặp lại hằng ngày."
        />
        <SelectField label="Trạng thái" value={enabled ? "on" : "off"} onChange={(event) => setEnabled(event.target.value === "on")}>
          <option value="on">Đang bật</option>
          <option value="off">Đang tắt</option>
        </SelectField>
      </div>
      <SelectField
        label="Thiết bị và công tắc"
        required
        value={optionKey}
        onChange={(event) => setOptionKey(event.target.value)}
      >
        <option value="">Chọn thiết bị</option>
        {options.map((option) => (
          <option key={`${option.deviceId}::${option.instanceCode}`} value={`${option.deviceId}::${option.instanceCode}`}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <SelectField label="Hành động" value={state} onChange={(event) => setState(event.target.value)}>
        <option value="true">Bật công tắc</option>
        <option value="false">Tắt công tắc</option>
      </SelectField>

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner label="Đang lưu" /> : null}
          {automation ? "Lưu thay đổi" : "Tạo lịch"}
        </Button>
      </div>
    </form>
  );
}