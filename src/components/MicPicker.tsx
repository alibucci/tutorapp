"use client";

type Props = {
  devices: MediaDeviceInfo[];
  value: string;
  onChange: (deviceId: string) => void;
  disabled?: boolean;
};

/**
 * Which microphone the tutor is on. In a room this is the whole ballgame: mic
 * placement decides what ends up on the tape.
 */
export function MicPicker({ devices, value, onChange, disabled }: Props) {
  return (
    <label className="block">
      <span className="label">Microphone</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || devices.length === 0}
        className="field"
      >
        {devices.length === 0 && (
          <option value="">Grant mic access to list devices</option>
        )}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
          </option>
        ))}
      </select>
    </label>
  );
}
