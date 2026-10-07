'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError, createAutomation, updateAutomation } from '@/lib/api';
import type { Automation, Device } from '@/lib/api/contract';

interface RelayOption { deviceId: string; instanceCode: string; kind: string | null; label: string; }
interface SoilOption { deviceId: string; label: string; }

export interface AutomationFormProps {
  homeId: string;
  devices: Device[];
  automation?: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}
export function AutomationForm({ homeId, devices, automation, onClose, onSaved }: AutomationFormProps) {
  const relayOptions = useMemo<RelayOption[]>(
    () => devices.flatMap((device) => device.capabilities.filter((item) => item.code === 'relay').map((item) => ({
      deviceId: device.deviceId,
      instanceCode: item.instanceCode,
      kind: typeof item.config?.kind === 'string' ? item.config.kind : null,
      label: (item.name ?? item.instanceCode) + ' · ' + device.name + ' (' + item.instanceCode + ')',
    }))),
    [devices],
  );
  const soilOptions = useMemo<SoilOption[]>(
    () => devices.filter((device) => device.capabilities.some((item) => item.code === 'soil_moisture')).map((device) => ({
      deviceId: device.deviceId,
      label: device.name + ' (' + device.deviceId + ')',
    })),
    [devices],
  );
  const existingSensor = automation?.schedule.type === 'soil_moisture_below' ? automation.schedule.sensorDeviceId ?? '' : '';
  const [name, setName] = useState(automation?.name ?? '');
  const [ruleType, setRuleType] = useState<'daily' | 'soil_moisture_below'>(automation?.schedule.type ?? 'daily');
  const [time, setTime] = useState(automation?.schedule.time ?? '18:00');
  const [threshold, setThreshold] = useState(String(automation?.schedule.threshold ?? 35));
  const [cooldownMinutes, setCooldownMinutes] = useState(String(automation?.schedule.cooldownMinutes ?? 60));
  const [sensorDeviceId, setSensorDeviceId] = useState(existingSensor);
  const [enabled, setEnabled] = useState(automation?.enabled ?? true);
  const [optionKey, setOptionKey] = useState(automation ? automation.action.deviceId + '::' + automation.action.capability : '');
  const [state, setState] = useState(automation?.action.params.state === false ? 'false' : 'true');
  const [shutdownMode, setShutdownMode] = useState<'none' | 'after' | 'time'>(automation?.action.offTime ? 'time' : automation?.action.offAfterMinutes ? 'after' : 'none');
  const [offAfterMinutes, setOffAfterMinutes] = useState(String(automation?.action.offAfterMinutes ?? 10));
  const [offTime, setOffTime] = useState(automation?.action.offTime ?? '18:30');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const relay = relayOptions.find((item) => item.deviceId + '::' + item.instanceCode === optionKey);
    if (!name.trim() || !relay) {
      setError('Hãy nhập tên và chọn relay cần điều khiển.');
      return;
    }
    const thresholdNumber = Number(threshold);
    const cooldownNumber = Number(cooldownMinutes);
    const offAfterNumber = Number(offAfterMinutes);
    const schedule = ruleType === 'daily'
      ? { type: 'daily' as const, time }
      : { type: 'soil_moisture_below' as const, sensorDeviceId, capability: 'soil_moisture' as const, threshold: thresholdNumber, cooldownMinutes: cooldownNumber };
    if (ruleType === 'daily' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError('Giờ phải có định dạng HH:MM.');
      return;
    }
    if (ruleType === 'soil_moisture_below' && (!sensorDeviceId || !Number.isFinite(thresholdNumber) || thresholdNumber < 0 || thresholdNumber > 100 || !Number.isInteger(cooldownNumber) || cooldownNumber < 1 || cooldownNumber > 1440)) {
      setError('Chọn cảm biến và nhập ngưỡng 0–100%, cooldown 1–1440 phút.');
      return;
    }
    if (shutdownMode === 'after' && (!Number.isInteger(offAfterNumber) || offAfterNumber < 1 || offAfterNumber > 1440)) {
      setError('Thời lượng tự tắt phải từ 1 đến 1440 phút.');
      return;
    }
    if (shutdownMode === 'time' && (ruleType !== 'daily' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(offTime))) {
      setError('Giờ tắt chỉ dùng cho lịch hằng ngày và phải có định dạng HH:MM.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        enabled,
        schedule,
        action: { deviceId: relay.deviceId, capability: relay.instanceCode, command: 'set_relay' as const, params: { state: state === 'true' }, ...(state === 'true' && (shutdownMode === 'after' || ruleType === 'soil_moisture_below') ? { offAfterMinutes: offAfterNumber } : {}), ...(state === 'true' && shutdownMode === 'time' ? { offTime } : {}) },
      };
      if (automation) await updateAutomation(automation.id, payload);
      else await createAutomation(homeId, payload);
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Không lưu được lịch.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className='space-y-4' onSubmit={onSubmit} noValidate>
      <TextField label='Tên lịch' required value={name} onChange={(event) => setName(event.target.value)} hint='Ví dụ: Bật đèn phòng khách hoặc Tưới cây khi đất khô.' />
      <SelectField label='Kiểu tự động hóa' value={ruleType} onChange={(event) => { const next = event.target.value as 'daily' | 'soil_moisture_below'; setRuleType(next); if (next === 'soil_moisture_below') { setShutdownMode('after'); setState('true'); } }}>
        <option value='daily'>Theo giờ hằng ngày</option>
        <option value='soil_moisture_below'>Tưới khi độ ẩm đất thấp</option>
      </SelectField>
      {ruleType === 'daily' ? (
        <TextField label='Giờ chạy' type='time' required value={time} onChange={(event) => setTime(event.target.value)} hint='Lịch lặp lại hằng ngày theo giờ Việt Nam.' />
      ) : (
        <>
          <SelectField label='Thiết bị đo độ ẩm đất' required value={sensorDeviceId} onChange={(event) => setSensorDeviceId(event.target.value)}>
            <option value=''>Chọn cảm biến đất</option>
            {soilOptions.map((item) => <option key={item.deviceId} value={item.deviceId}>{item.label}</option>)}
          </SelectField>
          <div className='grid gap-3 sm:grid-cols-2'>
            <TextField label='Tưới khi nhỏ hơn (%)' type='number' min='0' max='100' required value={threshold} onChange={(event) => setThreshold(event.target.value)} />
            <TextField label='Cooldown (phút)' type='number' min='1' max='1440' required value={cooldownMinutes} onChange={(event) => setCooldownMinutes(event.target.value)} hint='Chống bơm bị bật lặp lại theo từng mẫu đo.' />
          </div>
        </>
      )}
      <SelectField label={ruleType === 'soil_moisture_below' ? 'Bơm tưới (relay loại pump)' : 'Thiết bị và relay cần điều khiển'} required value={optionKey} onChange={(event) => setOptionKey(event.target.value)}>
        <option value=''>Chọn relay</option>
        {relayOptions.filter((item) => ruleType !== 'soil_moisture_below' || item.kind === 'pump').map((item) => <option key={item.deviceId + '::' + item.instanceCode} value={item.deviceId + '::' + item.instanceCode}>{item.label}</option>)}
      </SelectField>
      {ruleType === 'soil_moisture_below' && !relayOptions.some((item) => item.kind === 'pump') && <p className='text-xs text-ink-subtle'>Chưa có relay loại Bơm tưới. Vào chi tiết thiết bị, đặt loại relay là “Bơm tưới”, lưu cấu hình rồi quay lại.</p>}
      <div className='grid gap-3 sm:grid-cols-2'>
        <SelectField label='Hành động' value={state} onChange={(event) => setState(event.target.value)}>
          <option value='true'>Bật relay</option>
          {ruleType !== 'soil_moisture_below' && <option value='false'>Tắt relay</option>}
        </SelectField>
        <SelectField label='Trạng thái lịch' value={enabled ? 'on' : 'off'} onChange={(event) => setEnabled(event.target.value === 'on')}>
          <option value='on'>Đang bật</option>
          <option value='off'>Tạm tắt</option>
        </SelectField>
      </div>
      {state === 'true' && <>
        {ruleType !== 'soil_moisture_below' && <SelectField label='Tự động tắt' value={shutdownMode} onChange={(event) => setShutdownMode(event.target.value as 'none' | 'after' | 'time')}>
          <option value='none'>Không tự tắt</option>
          <option value='after'>Tắt sau một khoảng thời gian</option>
          {ruleType === 'daily' && <option value='time'>Tắt vào giờ cố định</option>}
        </SelectField>}
        {(shutdownMode === 'after' || ruleType === 'soil_moisture_below') && <TextField label='Tắt sau (phút)' type='number' min='1' max='1440' required value={offAfterMinutes} onChange={(event) => setOffAfterMinutes(event.target.value)} hint={ruleType === 'soil_moisture_below' ? 'Bắt buộc để tránh bơm chạy liên tục; chỉ đếm khi relay đã bật thành công.' : 'Chỉ bắt đầu đếm khi relay đã phản hồi bật thành công.'} />}
        {shutdownMode === 'time' && <TextField label='Giờ tắt' type='time' required value={offTime} onChange={(event) => setOffTime(event.target.value)} hint='Chạy hằng ngày theo giờ Việt Nam.' />}
      </>}
      {error && <p role='alert' className='text-sm text-bad'>{error}</p>}
      <div className='flex justify-end gap-2'>
        <Button variant='secondary' onClick={onClose}>Huỷ</Button>
        <Button type='submit' disabled={submitting}>{submitting ? <Spinner label='Đang lưu' /> : null}{automation ? 'Lưu thay đổi' : 'Tạo tự động hóa'}</Button>
      </div>
    </form>
  );
}
// Form intentionally owns all rule validation before calling the Backend.
