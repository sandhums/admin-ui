import { hisFetch } from "./bff";

export type CodedChoice = {
  code: string;
  display: string;
  system?: string;
};

export type RegistrationChoicesResponse = {
  gender: CodedChoice[];
  telecom_system: CodedChoice[];
  telecom_use: CodedChoice[];
  address_use: CodedChoice[];
};

export type RegisterPatientRequest = {
  family_name: string;
  given_names: string[];
  gender: string;
  birth_date?: string;
  telecom?: { system: string; value: string; use_?: string }[];
  address?: {
    use_?: string;
    line: string[];
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  }[];
  birth_place?: {
    city?: string;
    state?: string;
    country?: string;
  };
  allow_duplicates?: boolean;
};

export type RegisterPatientResponse = {
  patient_id: string;
  mrn: string;
};

export type DuplicateMatch = {
  patient_id: string;
  mrn?: string;
  name?: string;
  birth_date?: string;
  match_reason: string;
};

export type DuplicateSummary = {
  count: number;
  matches: DuplicateMatch[];
};

export type SlotSummary = {
  slot_id: string;
  start: string;
  end: string;
  schedule_id?: string;
  status?: string;
};

export type FindSlotsResponse = {
  count: number;
  slots: SlotSummary[];
};

export type BookingDoctor = {
  practitioner_id: string;
  name: string;
  schedule_id: string;
  location_id?: string;
};

export type ListBookingDoctorsResponse = {
  count: number;
  doctors: BookingDoctor[];
};

export type BookAppointmentRequest = {
  patient_id: string;
  slot_id: string;
  practitioner_id?: string;
  location_id?: string;
  description?: string;
};

export type BookAppointmentResponse = {
  appointment_id: string;
  slot_id: string;
};

export type AppointmentSummary = {
  appointment_id: string;
  patient_id?: string;
  patient_name?: string;
  start?: string;
  end?: string;
  status: string;
  description?: string;
  location_id?: string;
  encounter_id?: string;
};

export type LookupPatientAppointmentResponse = {
  patient_id: string;
  date: string;
  appointment: AppointmentSummary | null;
};

export async function getRegistrationChoices(): Promise<RegistrationChoicesResponse> {
  return hisFetch("registration/choices");
}

export async function checkDuplicates(body: RegisterPatientRequest): Promise<DuplicateSummary> {
  return hisFetch("patients/check-duplicates", { method: "POST", body: JSON.stringify(body) });
}

export async function registerPatient(body: RegisterPatientRequest): Promise<RegisterPatientResponse> {
  return hisFetch("patients", { method: "POST", body: JSON.stringify(body) });
}

export async function findSlots(params: {
  schedule_id: string;
  start: string;
  end?: string;
  practitioner_id?: string;
}): Promise<FindSlotsResponse> {
  const qs = new URLSearchParams({
    schedule_id: params.schedule_id,
    start: params.start,
  });
  if (params.end) qs.set("end", params.end);
  if (params.practitioner_id) qs.set("practitioner_id", params.practitioner_id);
  return hisFetch(`slots?${qs.toString()}`);
}

export async function listBookingDoctors(hospitalId?: string): Promise<ListBookingDoctorsResponse> {
  const qs = new URLSearchParams();
  if (hospitalId) qs.set("hospital_id", hospitalId);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return hisFetch(`booking-doctors${suffix}`);
}

export type ExpandSlotsResponse = {
  schedule_id: string;
  from: string;
  to: string;
  slots_created: number;
};

export async function expandScheduleSlots(
  scheduleId: string,
  params: { from: string; to: string; hospitalId?: string },
): Promise<ExpandSlotsResponse> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  if (params.hospitalId) {
    qs.set("hospital_id", params.hospitalId);
  }
  return hisFetch(`schedules/${scheduleId}/expand-slots?${qs.toString()}`, {
    method: "POST",
  });
}

export type PractitionerSummary = {
  practitioner_id: string;
  name: string;
  gender?: string;
  active: boolean;
};

export type ListPractitionersResponse = {
  count: number;
  practitioners: PractitionerSummary[];
};

export type CreatePractitionerRequest = {
  practitioner_id: string;
  family_name: string;
  given_names: string[];
  prefix?: string[];
  gender: string;
};

export type CreatePractitionerResponse = {
  practitioner_id: string;
  name: string;
  gender: string;
};

export async function listPractitioners(): Promise<ListPractitionersResponse> {
  return hisFetch("practitioners");
}

export async function createPractitioner(
  body: CreatePractitionerRequest,
): Promise<CreatePractitionerResponse> {
  return hisFetch("practitioners", { method: "POST", body: JSON.stringify(body) });
}

export type CreateOpdScheduleRequest = {
  schedule_id: string;
  practitioner_id: string;
  hospital_id?: string;
  campus_id?: string;
  weekdays: string[];
  hour: number;
  minute?: number;
  planning_horizon_start?: string;
  planning_horizon_end?: string;
  timezone?: string;
};

export type CreateOpdScheduleResponse = {
  schedule_id: string;
  practitioner_id: string;
  campus_id: string;
  rrule: string;
};

export async function createOpdSchedule(
  body: CreateOpdScheduleRequest,
): Promise<CreateOpdScheduleResponse> {
  return hisFetch("schedules", { method: "POST", body: JSON.stringify(body) });
}

export async function bookAppointment(body: BookAppointmentRequest): Promise<BookAppointmentResponse> {
  return hisFetch("appointments", { method: "POST", body: JSON.stringify(body) });
}

export async function lookupPatientAppointment(params: {
  patient_id: string;
  date: string;
  practitioner_id?: string;
}): Promise<LookupPatientAppointmentResponse> {
  const qs = new URLSearchParams({
    patient_id: params.patient_id,
    date: params.date,
  });
  if (params.practitioner_id) qs.set("practitioner_id", params.practitioner_id);
  return hisFetch(`appointments?${qs.toString()}`);
}

export type CancelAppointmentRequest = {
  reason?: string;
};

export type RescheduleAppointmentRequest = {
  new_slot_id: string;
};

export type BedBoardEntry = {
  bed_id: string;
  bed_name: string;
  ward_id?: string;
  operational_status?: string;
  occupied: boolean;
  encounter_id?: string;
  patient_id?: string;
  patient_name?: string;
};

export type BedBoardResponse = {
  count: number;
  beds: BedBoardEntry[];
};

export async function cancelAppointment(
  appointmentId: string,
  body: CancelAppointmentRequest = {},
): Promise<unknown> {
  return hisFetch(`appointments/${appointmentId}/cancel`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function rescheduleAppointment(
  appointmentId: string,
  body: RescheduleAppointmentRequest,
): Promise<unknown> {
  return hisFetch(`appointments/${appointmentId}/reschedule`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getBedBoard(params?: { ward_id?: string }): Promise<BedBoardResponse> {
  const qs = new URLSearchParams();
  if (params?.ward_id) qs.set("ward_id", params.ward_id);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return hisFetch(`bed-board${suffix}`);
}

export type FoundationConfig = {
  tenant_id: string;
  organization: { id: string; name: string; active: boolean };
  campus?: { id: string; name: string };
  wards: {
    id: string;
    name: string;
    campus_id?: string;
    beds: { id: string; name: string; status?: string }[];
  }[];
  healthcare_services: { id: string; name: string; active: boolean }[];
  opd_doctors: BookingDoctor[];
};

export async function getFoundationConfig(hospitalId?: string): Promise<FoundationConfig> {
  const qs = new URLSearchParams();
  if (hospitalId) {
    qs.set("hospital_id", hospitalId);
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return hisFetch(`foundation${suffix}`);
}

export async function updateOrganizationName(
  name: string,
  hospitalId?: string,
): Promise<{ id: string; name: string; active: boolean }> {
  const qs = new URLSearchParams();
  if (hospitalId) {
    qs.set("hospital_id", hospitalId);
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return hisFetch(`foundation/organization${suffix}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export type HospitalSummary = {
  id: string;
  name: string;
  active: boolean;
};

export type ListHospitalsResponse = {
  hospitals: HospitalSummary[];
};

export async function listHospitals(): Promise<ListHospitalsResponse> {
  return hisFetch("foundation/hospitals");
}
