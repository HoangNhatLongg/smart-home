"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { SelectField, TextField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/StatusBadge";
import { ApiError, updateConfiguration, updateDeviceName } from "@/lib/api";
import type { Device, DeviceConfiguration } from "@/lib/api/contract";
import { formatDateTime } from "@/lib/format";

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const bool = (value: unknown, fallback = false) => typeof value === "boolean" ? value : fallback;
const gpio = (value: unknown, fallback: number) => typeof value === "number" && Number.isInteger(value) ? String(value) : String(fallback);
const RELAY_KINDS = [
  ["light", "Đèn"], ["pump", "Bơm"], ["fan", "Quạt"], ["socket", "Ổ cắm"], ["curtain", "Rèm"], ["other", "Khác"],
] as const;
// Safe digital pins on the generic ESP32-C3 profile. GPIO2/8/9 are strapping
// pins, 12-19 are reserved for flash/USB, and 20/21 are kept for serial.
const DIGITAL_GPIOS = [0, 1, 3, 4, 5, 6, 7, 10, 11] as const;
const DEFAULT_RELAY_GPIOS = [0, 1, 3, 5, 6, 7, 10, 11] as const;
const SENSOR_GPIOS = DIGITAL_GPIOS.map(String);
const SOIL_GPIOS = ["0", "1", "3", "4"];

export function ConfigurationPanel({ device, configuration, onRefresh }: { device: Device; configuration: DeviceConfiguration | null; onRefresh: () => void }) {
  const desired = configuration?.desired ?? {};
  const applied = configuration?.applied ?? null;
  const hardware = record(desired.hardware);
  const dht = record(hardware.dht11); const soil = record(hardware.soil_moisture); const motion = record(hardware.motion);
  const relays = Array.isArray(hardware.relays) ? hardware.relays.map(record) : [];
  const desiredInterval = typeof desired.telemetry_interval === "number" ? String(desired.telemetry_interval) : "30";
  const relayMetadata = record(desired.relay_metadata);
  const sourceKey = `${device.deviceId}|${device.name}|${desiredInterval}|${JSON.stringify(hardware)}|${JSON.stringify(desired.relay_metadata ?? {})}`;

  const [seededKey, setSeededKey] = useState(sourceKey);
  const initialRelayDetails = () => Object.fromEntries(Array.from({ length: 8 }, (_, i) => { const instance = `relay_${i + 1}`; const item = record(relayMetadata[instance]); const savedName = desired[`${instance}_name`]; return [i, { name: typeof item.name === "string" ? item.name : typeof savedName === "string" ? savedName : device.capabilities.find((cap) => cap.instanceCode === instance)?.name ?? "", kind: typeof item.kind === "string" ? item.kind : i === 0 ? "light" : "other", description: typeof item.description === "string" ? item.description : "" }]; }));
  const [relayDetails, setRelayDetails] = useState<Record<number, { name: string; kind: string; description: string }>>(initialRelayDetails);
  const [name, setName] = useState(device.name); const [interval, setInterval] = useState(desiredInterval);
  const [dhtEnabled, setDhtEnabled] = useState(bool(dht.enabled, device.capabilities.some((item) => item.code === "temperature"))); const [dhtGpio, setDhtGpio] = useState(gpio(dht.gpio, 4));
  const [soilEnabled, setSoilEnabled] = useState(bool(soil.enabled)); const [soilGpio, setSoilGpio] = useState(gpio(soil.gpio, 0));
  const [motionEnabled, setMotionEnabled] = useState(bool(motion.enabled)); const [motionGpio, setMotionGpio] = useState(gpio(motion.gpio, 1));
  const [relayCount, setRelayCount] = useState(String(relays.length || device.capabilities.filter((item) => item.code === "relay").length)); const [relayGpios, setRelayGpios] = useState<string[]>(Array.from({ length: 8 }, (_, i) => gpio(relays[i]?.gpio, DEFAULT_RELAY_GPIOS[i]))); const [activeHigh, setActiveHigh] = useState(bool(relays[0]?.active_high, false));
  const [savingName, setSavingName] = useState(false); const [savingConfig, setSavingConfig] = useState(false); const [savingHardware, setSavingHardware] = useState(false); const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  if (seededKey !== sourceKey) { setSeededKey(sourceKey); setName(device.name); setInterval(desiredInterval); setRelayDetails(initialRelayDetails()); setDhtEnabled(bool(dht.enabled, device.capabilities.some((item) => item.code === "temperature"))); setDhtGpio(gpio(dht.gpio, 4)); setSoilEnabled(bool(soil.enabled)); setSoilGpio(gpio(soil.gpio, 0)); setMotionEnabled(bool(motion.enabled)); setMotionGpio(gpio(motion.gpio, 1)); setRelayCount(String(relays.length || device.capabilities.filter((item) => item.code === "relay").length)); setRelayGpios(Array.from({ length: 8 }, (_, i) => gpio(relays[i]?.gpio, DEFAULT_RELAY_GPIOS[i]))); setActiveHigh(bool(relays[0]?.active_high, false)); }

  const applying = useMemo(() => !!configuration && stableStringify(configuration.desired) !== stableStringify(configuration.applied), [configuration]);
  const gpioAssignments = [
    ...(dhtEnabled ? [{ key: "dht11", pin: dhtGpio }] : []),
    ...(soilEnabled ? [{ key: "soil", pin: soilGpio }] : []),
    ...(motionEnabled ? [{ key: "motion", pin: motionGpio }] : []),
    ...relayGpios.slice(0, Number(relayCount)).map((pin, index) => ({ key: `relay_${index + 1}`, pin })),
  ];
  const gpioUsedByOthers = (key: string) => new Set(gpioAssignments.filter((assignment) => assignment.key !== key).map((assignment) => assignment.pin));
  const hasGpioConflict = new Set(gpioAssignments.map((assignment) => assignment.pin)).size !== gpioAssignments.length;
  const report = (cause: unknown, fallback: string) => setMessage({ tone: "bad", text: cause instanceof ApiError ? cause.message : fallback });
  const number = (value: string) => { const parsed = Number(value); return Number.isInteger(parsed) && DIGITAL_GPIOS.includes(parsed as typeof DIGITAL_GPIOS[number]) ? parsed : null; };

  const onSaveName = async () => { setSavingName(true); setMessage(null); try { await updateDeviceName(device.deviceId, name.trim()); setMessage({ tone: "ok", text: "Đã cập nhật tên thiết bị." }); onRefresh(); } catch (cause) { report(cause, "Không cập nhật được tên thiết bị."); } finally { setSavingName(false); } };
  const onSaveConfiguration = async () => {
    const parsed = Number(interval);
    if (!Number.isFinite(parsed) || parsed < 5 || parsed > 3600) { setMessage({ tone: "bad", text: "Chu kỳ phải từ 5 đến 3600 giây." }); return; }
    setSavingConfig(true); setMessage(null);
    try {
      const details = Object.fromEntries(Array.from({ length: Number(relayCount) }, (_, index) => [`relay_${index + 1}`, { name: relayDetails[index]?.name.trim() || undefined, kind: relayDetails[index]?.kind ?? "other", description: relayDetails[index]?.description.trim() ?? "" }]));
      const payload: Record<string, unknown> = { telemetry_interval: Math.round(parsed), relay_metadata: details };
      for (let i = 0; i < Number(relayCount); i++) if (relayDetails[i]?.name.trim()) payload[`relay_${i + 1}_name`] = relayDetails[i].name.trim();
      await updateConfiguration(device.deviceId, payload);
      setMessage({ tone: "ok", text: "Đã lưu tên và chi tiết các relay." }); onRefresh();
    } catch (cause) { report(cause, "Không cập nhật được cấu hình."); } finally { setSavingConfig(false); }
  };
  const onSaveHardware = async () => {
    const count = Number(relayCount);
    const activePins = [dhtEnabled ? number(dhtGpio) : null, soilEnabled ? Number(soilGpio) : null, motionEnabled ? number(motionGpio) : null, ...relayGpios.slice(0, count).map(number)].filter((pin): pin is number => pin !== null);
    const expectedPinCount = Number(dhtEnabled) + Number(soilEnabled) + Number(motionEnabled) + count;
    if (activePins.length !== expectedPinCount || new Set(activePins).size !== activePins.length) { setMessage({ tone: "bad", text: "Chọn GPIO được hỗ trợ; mỗi thiết bị ngoại vi phải dùng một chân riêng." }); return; }
    if (!window.confirm("ESP sẽ lưu cấu hình, khởi động lại và tạm ngắt điều khiển. Bạn muốn tiếp tục?")) return;
    setSavingHardware(true); setMessage(null);
    try {
      await updateConfiguration(device.deviceId, { hardware: { dht11: { enabled: dhtEnabled, gpio: number(dhtGpio) }, soil_moisture: { enabled: soilEnabled, gpio: Number(soilGpio) }, motion: { enabled: motionEnabled, gpio: number(motionGpio) }, relays: relayGpios.slice(0, count).map((pin) => ({ gpio: Number(pin), active_high: activeHigh })) } });
      setMessage({ tone: "ok", text: "Đã gửi cấu hình phần cứng. ESP sẽ khởi động lại rồi công bố tính năng mới." }); onRefresh();
    } catch (cause) { report(cause, "Không gửi được cấu hình phần cứng."); } finally { setSavingHardware(false); }
  };

  return <div className="space-y-4">
    {message && <p role="status" className={`text-sm ${message.tone === "ok" ? "text-ok" : "text-bad"}`}>{message.text}</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Thông tin chung" description="Tên hiển thị trong Dashboard."><div className="space-y-3"><TextField label="Tên thiết bị" value={name} onChange={(event) => setName(event.target.value)} hint={`Mã thiết bị: ${device.deviceId}`} /><Button onClick={onSaveName} disabled={savingName || !name.trim()}>{savingName ? <Spinner label="Đang lưu" /> : null} Lưu tên</Button></div></Section>
      <Section title="Chu kỳ gửi số đo" description="Áp dụng cho toàn bộ cảm biến đang bật." actions={<Badge tone="neutral">{configuration?.configVersion ?? "—"}</Badge>}><div className="space-y-3"><TextField label="Khoảng cách (giây)" type="number" min={5} max={3600} value={interval} onChange={(event) => setInterval(event.target.value)} /><Button onClick={onSaveConfiguration} disabled={savingConfig}>{savingConfig ? <Spinner label="Đang gửi" /> : null} Gửi cấu hình</Button></div></Section>
      <Section title="Phần cứng và GPIO" description="Chọn chân phù hợp với board ESP32-C3; GPIO được lọc theo phần cứng hỗ trợ.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink"><input type="checkbox" checked={dhtEnabled} onChange={(event) => setDhtEnabled(event.target.checked)} /> DHT11 (nhiệt độ, độ ẩm)</label>
          {dhtEnabled && <SelectField label="GPIO DHT11" value={dhtGpio} onChange={(event) => setDhtGpio(event.target.value)}>{SENSOR_GPIOS.map((pin) => <option key={pin} value={pin} disabled={gpioUsedByOthers("dht11").has(pin) && dhtGpio !== pin}>GPIO {pin}</option>)}</SelectField>}
          <label className="flex items-center gap-2 text-sm font-medium text-ink"><input type="checkbox" checked={soilEnabled} onChange={(event) => setSoilEnabled(event.target.checked)} /> Cảm biến độ ẩm đất</label>
          {soilEnabled && <SelectField label="GPIO ADC độ ẩm đất" value={soilGpio} onChange={(event) => setSoilGpio(event.target.value)}>{SOIL_GPIOS.map((pin) => <option key={pin} value={pin} disabled={gpioUsedByOthers("soil").has(pin) && soilGpio !== pin}>GPIO {pin} (ADC)</option>)}</SelectField>}
          <label className="flex items-center gap-2 text-sm font-medium text-ink"><input type="checkbox" checked={motionEnabled} onChange={(event) => setMotionEnabled(event.target.checked)} /> Cảm biến chuyển động PIR</label>
          {motionEnabled && <SelectField label="GPIO PIR" value={motionGpio} onChange={(event) => setMotionGpio(event.target.value)}>{SENSOR_GPIOS.map((pin) => <option key={pin} value={pin} disabled={gpioUsedByOthers("motion").has(pin) && motionGpio !== pin}>GPIO {pin}</option>)}</SelectField>}
          <SelectField label="Số relay (tối đa 8)" value={relayCount} onChange={(event) => setRelayCount(event.target.value)}>{Array.from({ length: 9 }, (_, count) => <option key={count} value={count}>{count === 0 ? "Không dùng relay" : `${count} relay`}</option>)}</SelectField>
          {Array.from({ length: Number(relayCount) }, (_, index) => <SelectField key={index} label={`GPIO relay ${index + 1}`} value={relayGpios[index]} onChange={(event) => setRelayGpios((previous) => previous.map((pin, i) => i === index ? event.target.value : pin))}>{DIGITAL_GPIOS.map((pin) => <option key={pin} value={pin} disabled={gpioUsedByOthers(`relay_${index + 1}`).has(String(pin)) && relayGpios[index] !== String(pin)}>GPIO {pin}</option>)}</SelectField>)}
          {Number(relayCount) > 0 && <label className="flex items-center gap-2 text-sm font-medium text-ink"><input type="checkbox" checked={activeHigh} onChange={(event) => setActiveHigh(event.target.checked)} /> Relay active HIGH</label>}
        </div>
        {hasGpioConflict && <p role="alert" className="mt-2 text-sm text-bad">Đang có thiết bị dùng trùng GPIO. Hãy chọn mỗi thiết bị một chân riêng.</p>}
        <p className="mt-3 text-xs text-ink-subtle">Relay/DHT11/PIR chỉ hiện chân digital khả dụng; cảm biến đất chỉ hiện GPIO có ADC. Không gán trùng chân. Số relay tối đa còn phụ thuộc số chân đã dùng cho cảm biến.</p>
        <Button className="mt-3" onClick={onSaveHardware} disabled={savingHardware || device.status !== "online" || hasGpioConflict}>{savingHardware ? <Spinner label="Đang gửi" /> : null} Lưu cấu hình phần cứng</Button>
      </Section>
      {Number(relayCount) > 0 && <Section title="Thiết bị gắn với ESP" description="Tên, loại và ghi chú được lưu riêng cho từng relay; mã relay_N chỉ dùng nội bộ.">
        <div className="space-y-5">
          {Array.from({ length: Number(relayCount) }, (_, index) => <div key={index} className={`grid gap-3 sm:grid-cols-2 ${index > 0 ? "border-t border-line pt-4" : ""}`}>
            <TextField label={`Tên relay ${index + 1}`} value={relayDetails[index]?.name ?? ""} onChange={(event) => setRelayDetails((previous) => ({ ...previous, [index]: { ...previous[index], name: event.target.value } }))} placeholder={index === 0 ? "Đèn phòng khách" : index === 1 ? "Bơm tưới cây" : "Tên thiết bị"} maxLength={64} />
            <SelectField label={`Loại relay ${index + 1}`} value={relayDetails[index]?.kind ?? "other"} onChange={(event) => setRelayDetails((previous) => ({ ...previous, [index]: { ...previous[index], kind: event.target.value } }))}>{RELAY_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
            <div className="sm:col-span-2"><TextField label={`Ghi chú relay ${index + 1}`} value={relayDetails[index]?.description ?? ""} onChange={(event) => setRelayDetails((previous) => ({ ...previous, [index]: { ...previous[index], description: event.target.value } }))} placeholder="Ví dụ: đèn trần khu vực sofa" maxLength={160} /></div>
          </div>)}
          <Button onClick={onSaveConfiguration} disabled={savingConfig || Array.from({ length: Number(relayCount) }, (_, i) => !relayDetails[i]?.name.trim()).some(Boolean)}>{savingConfig ? <Spinner label="Đang lưu" /> : null} Lưu tên và chi tiết relay</Button>
        </div>
      </Section>}
      <Section title="Trạng thái áp dụng" description="So sánh cấu hình bạn đặt với cấu hình ESP đang dùng." actions={<Badge tone={applying ? "warn" : "ok"}>{applying ? "Đang áp dụng" : "Khớp"}</Badge>}><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-line bg-surface-muted p-3"><p className="text-xs text-ink-subtle">Bạn đặt</p><pre className="mt-1 overflow-x-auto text-xs text-ink">{JSON.stringify(desired, null, 2)}</pre></div><div className="rounded-md border border-line bg-surface-muted p-3"><p className="text-xs text-ink-subtle">ESP đang dùng</p><pre className="mt-1 overflow-x-auto text-xs text-ink">{applied ? JSON.stringify(applied, null, 2) : "Chưa có"}</pre></div></div><p className="mt-2.5 text-xs text-ink-subtle">{applying ? "Chờ ESP phản hồi cấu hình đã áp dụng." : `Cấu hình đã khớp · áp dụng lúc ${formatDateTime(configuration?.appliedAt ?? null)}`}</p></Section>
    </div>
  </div>;
}
