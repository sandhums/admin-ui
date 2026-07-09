import type { SlotSummary } from "../api/his";
import { formatSlotTime } from "../constants";

type SlotPickerProps = {
  slots: SlotSummary[];
  selectedSlotId: string | null;
  onSelect: (slotId: string) => void;
  disabled?: boolean;
};

export default function SlotPicker({ slots, selectedSlotId, onSelect, disabled }: SlotPickerProps) {
  if (slots.length === 0) return null;

  return (
    <div className="slot-picker">
      <p className="muted">Select a time slot</p>
      <div className="slot-list" role="listbox" aria-label="Available slots">
        {slots.map((slot) => {
          const selected = slot.slot_id === selectedSlotId;
          return (
            <button
              key={slot.slot_id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              className={`slot-option${selected ? " selected" : ""}`}
              onClick={() => onSelect(slot.slot_id)}
            >
              <span className="slot-time">{formatSlotTime(slot.start)}</span>
              {slot.status ? <span className="slot-meta">{slot.status}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
