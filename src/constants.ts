export const SCHEDULE_ID = import.meta.env.VITE_SCHEDULE_ID ?? "opd-patel-schedule";
export const PRACTITIONER_ID = import.meta.env.VITE_PRACTITIONER_ID ?? "dr-patel";
export const PRACTITIONER_NAME = "Dr. Patel";
export const LOCATION_ID = import.meta.env.VITE_LOCATION_ID ?? "campus-gurugram";

export type BookingDoctor = {
  practitioner_id: string;
  name: string;
  schedule_id: string;
  location_id?: string;
};

export function campusForHospital(hospitalId: string): string | undefined {
  if (hospitalId === "atrius-gurugram") return "campus-gurugram";
  if (hospitalId === "atrius-goa") return "campus-goa";
  return undefined;
}

/** GST registration state for a campus Organization id (ISO 3166-2 IN subdivision). */
export function hospitalGstState(hospitalId?: string | null): string {
  switch ((hospitalId ?? "").trim()) {
    case "atrius-goa":
      return "GA";
    case "atrius-gurugram":
    default:
      return "HR";
  }
}

export function filterDoctorsForHospital(
  doctors: BookingDoctor[],
  hospitalId?: string | null,
): BookingDoctor[] {
  if (!hospitalId) return doctors;
  const campus = campusForHospital(hospitalId);
  if (!campus) return doctors;
  const filtered = doctors.filter((doctor) => doctor.location_id === campus);
  return filtered.length > 0 ? filtered : doctors;
}

/** Fallback when GET /booking-doctors is unavailable (e.g. older his-server). */
export const DEFAULT_BOOKING_DOCTORS: BookingDoctor[] = [
  {
    practitioner_id: "dr-patel",
    name: "Dr. Anita Patel",
    schedule_id: "opd-patel-schedule",
    location_id: LOCATION_ID,
  },
  {
    practitioner_id: "dr-sharma",
    name: "Dr. Raj Sharma",
    schedule_id: "opd-sharma-schedule",
    location_id: LOCATION_ID,
  },
];
export const CLINICAL_UI_BASE = import.meta.env.VITE_CLINICAL_UI_URL ?? "http://localhost:5173";

export function todayIsoDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatSlotTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatSlotDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
