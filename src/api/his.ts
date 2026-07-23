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

/** Active (or filtered) encounter row from `GET /encounters` census. */
export type EncounterSummary = {
  encounter_id: string;
  patient_id?: string;
  patient_name?: string;
  status: string;
  class_code?: string;
  class_display?: string;
  reason?: string;
  location_id?: string;
  location_name?: string;
  bed_id?: string;
  ward_id?: string;
  period_start?: string;
  appointment_id?: string;
  practitioner_id?: string;
  hospital_id?: string;
};

export type EncounterCensusResponse = {
  count: number;
  encounters: EncounterSummary[];
};

export async function listEncounters(params?: {
  status?: string;
  class?: string;
  hospital_id?: string;
  _count?: number;
}): Promise<EncounterCensusResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.class) qs.set("class", params.class);
  if (params?.hospital_id) qs.set("hospital_id", params.hospital_id);
  if (params?._count != null) qs.set("_count", String(params._count));
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return hisFetch(`encounters${suffix}`);
}

export type DischargePatientRequest = {
  discharge_disposition?: string;
  destination_id?: string;
};

export async function dischargePatient(
  encounterId: string,
  body: DischargePatientRequest = {},
): Promise<unknown> {
  return hisFetch(`encounters/${encodeURIComponent(encounterId)}/discharge`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type AdmitPatientRequest = {
  patient_id: string;
  bed_id: string;
  hospital_id: string;
  practitioner_id?: string;
  appointment_id?: string;
  /** HL7 admit-source: `outp` | `emd` | `other` | … */
  admit_source?: string;
  reason?: string;
};

export type AdmitPatientResponse = {
  encounter_id: string;
  bed_id: string;
  episode_id?: string;
};

export async function admitPatient(body: AdmitPatientRequest): Promise<AdmitPatientResponse> {
  return hisFetch("encounters/admit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type PatientMatchResult = {
  patient_id: string;
  mrn?: string;
  name?: string;
  birth_date?: string;
  certainty: string;
  match_reason: string;
};

export type MatchPatientsResponse = {
  count: number;
  matches: PatientMatchResult[];
};

export async function matchPatients(body: {
  mrn?: string;
  family_name?: string;
  given_names?: string[];
  birth_date?: string;
}): Promise<MatchPatientsResponse> {
  return hisFetch("patients/$match", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type PatientSummary = {
  patient_id: string;
  mrn?: string;
  name?: string;
  birth_date?: string;
  gender?: string;
};

export type ListPatientsResponse = {
  count: number;
  patients: PatientSummary[];
};

export async function listPatients(params?: {
  name?: string;
  _count?: number;
}): Promise<ListPatientsResponse> {
  const qs = new URLSearchParams();
  if (params?.name?.trim()) qs.set("name", params.name.trim());
  if (params?._count != null) qs.set("_count", String(params._count));
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return hisFetch(`patients${suffix}`);
}

function patientDisplayName(resource: {
  name?: { text?: string; family?: string; given?: string[] }[];
}): string | undefined {
  const name = resource.name?.[0];
  if (!name) return undefined;
  if (name.text?.trim()) return name.text.trim();
  const given = (name.given ?? []).join(" ").trim();
  const parts = [given, name.family].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function patientMrn(resource: {
  identifier?: { system?: string; value?: string }[];
}): string | undefined {
  const identifiers = resource.identifier ?? [];
  const atrius = identifiers.find((id) => id.system?.includes("mrn") || id.value?.startsWith("MRN-"));
  return atrius?.value ?? identifiers[0]?.value;
}

export async function getPatient(patientId: string): Promise<PatientSummary> {
  const resource = await hisFetch<{
    id?: string;
    name?: { text?: string; family?: string; given?: string[] }[];
    identifier?: { system?: string; value?: string }[];
  }>(`patients/${encodeURIComponent(patientId)}`);
  return {
    patient_id: resource.id ?? patientId,
    mrn: patientMrn(resource),
    name: patientDisplayName(resource),
  };
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

// --- Billing desk ---

export type BillingItemSummary = {
  id: string;
  code: string;
  title: string;
  item_type?: string;
  hsn_sac?: string;
  gst_rate_class?: string;
  base_amount_inr?: number;
  schedule_id?: string;
  status?: string;
};

export type BillingItemListResponse = {
  items: BillingItemSummary[];
};

export type ChargeSummary = {
  id: string;
  status: string;
  code?: string;
  display?: string;
  encounter_id?: string;
  patient_id?: string;
  performer_id?: string;
  department_id?: string;
  unit_price_inr?: number;
  quantity?: number;
  occurrence_datetime?: string;
  tariff_source?: string;
  liability?: string;
  claimable_amount_inr?: number;
  contract_id?: string;
  package_case_id?: string;
};

export type ListChargesResponse = {
  charges: ChargeSummary[];
};

export type PostChargeRequest = {
  encounter_id: string;
  hospital_id: string;
  billing_code: string;
  quantity?: number;
  schedule_id?: string;
  performer_practitioner_id?: string;
  department_id?: string;
  place_of_supply_state?: string;
  hospital_state?: string;
};

export type PostChargeResponse = {
  charge: ChargeSummary;
};

export type IssueInvoiceRequest = {
  encounter_id: string;
  hospital_id: string;
  place_of_supply_state: string;
  hospital_state?: string;
  charge_item_ids?: string[];
};

export type InvoiceSummary = {
  id: string;
  status: string;
  total_net_inr?: number;
  total_gross_inr?: number;
  patient_id?: string;
  /** Statutory series, e.g. INV-GGN/2026-27/000001 */
  invoice_number?: string;
  hospital_gstin?: string;
  payment_notice_id?: string;
};

export type IssueInvoiceResponse = {
  invoice: InvoiceSummary;
};

export type CreditNoteRequest = {
  encounter_id: string;
  hospital_id: string;
  place_of_supply_state: string;
  hospital_state?: string;
  original_invoice_id: string;
  charge_item_ids: string[];
  reason: string;
};

export type AdjustChargeRequest = {
  reason: string;
  quantity?: number;
  unit_price_inr?: number;
};

export async function listBillingItems(scheduleId?: string): Promise<BillingItemListResponse> {
  const qs = scheduleId ? `?schedule_id=${encodeURIComponent(scheduleId)}` : "";
  return hisFetch(`billing-items${qs}`);
}

export async function seedDemoTariff(hospitalId?: string): Promise<{ created: string[] }> {
  const qs = hospitalId ? `?hospital_id=${encodeURIComponent(hospitalId)}` : "";
  return hisFetch(`billing-catalog/seed-demo${qs}`, { method: "POST", body: "{}" });
}

export async function listEncounterCharges(
  encounterId: string,
  status?: string,
): Promise<ListChargesResponse> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return hisFetch(`encounters/${encounterId}/charges${qs}`);
}

export async function postCharge(body: PostChargeRequest): Promise<PostChargeResponse> {
  return hisFetch("charges", { method: "POST", body: JSON.stringify(body) });
}

export async function voidCharge(chargeId: string): Promise<ChargeSummary> {
  return hisFetch(`charges/${encodeURIComponent(chargeId)}/void`, {
    method: "POST",
    body: "{}",
  });
}

export async function adjustCharge(
  chargeId: string,
  body: AdjustChargeRequest,
): Promise<ChargeSummary> {
  return hisFetch(`charges/${encodeURIComponent(chargeId)}/adjust`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function issueCashInvoice(body: IssueInvoiceRequest): Promise<IssueInvoiceResponse> {
  return hisFetch("invoices/cash", { method: "POST", body: JSON.stringify(body) });
}

export async function issueCreditNote(body: CreditNoteRequest): Promise<IssueInvoiceResponse> {
  return hisFetch("invoices/credit-note", { method: "POST", body: JSON.stringify(body) });
}

// --- Claims desk ---

export type CoverageSummary = {
  id: string;
  status: string;
  patient_id?: string;
  payor_organization_id?: string;
  subscriber_id?: string;
  contract_id?: string;
  payer_type_display?: string;
};

export type AttachCoverageRequest = {
  patient_id: string;
  payor_organization_id: string;
  subscriber_id?: string;
  payer_type_display?: string;
  id?: string;
  hospital_id?: string;
  contract_id?: string;
};

export type ClaimSummary = {
  id: string;
  status: string;
  patient_id?: string;
  total_inr?: number;
};

export type CreateClaimRequest = {
  encounter_id: string;
  hospital_id: string;
  coverage_id: string;
  insurer_organization_id: string;
  charge_item_ids?: string[];
  place_of_supply_state?: string;
  hospital_state?: string;
};

export type CreateClaimResponse = {
  claim: ClaimSummary;
};

export type EligibilityRequest = {
  patient_id: string;
  hospital_id: string;
  coverage_id: string;
  insurer_organization_id: string;
  package_code?: string;
  authorized_los_days?: number;
};

export type EligibilityResponse = {
  request_id: string;
  status: string;
};

export async function attachCoverage(body: AttachCoverageRequest): Promise<CoverageSummary> {
  return hisFetch("coverages", { method: "POST", body: JSON.stringify(body) });
}

export async function listPatientCoverages(patientId: string): Promise<CoverageSummary[]> {
  return hisFetch(`patients/${encodeURIComponent(patientId)}/coverages`);
}

export async function getCoverage(coverageId: string): Promise<CoverageSummary> {
  return hisFetch(`coverages/${encodeURIComponent(coverageId)}`);
}

export async function requestEligibility(
  body: EligibilityRequest,
): Promise<EligibilityResponse> {
  return hisFetch("coverage-eligibility", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createClaim(body: CreateClaimRequest): Promise<CreateClaimResponse> {
  return hisFetch("claims", { method: "POST", body: JSON.stringify(body) });
}

export async function getClaim(claimId: string): Promise<ClaimSummary> {
  return hisFetch(`claims/${encodeURIComponent(claimId)}`);
}

export async function cancelClaim(claimId: string): Promise<ClaimSummary> {
  return hisFetch(`claims/${encodeURIComponent(claimId)}/cancel`, {
    method: "POST",
    body: "{}",
  });
}

export async function exportClaimBundle(
  claimId: string,
  params?: { include_patient?: boolean; include_coverage?: boolean },
): Promise<unknown> {
  const qs = new URLSearchParams();
  if (params?.include_patient === false) qs.set("include_patient", "false");
  if (params?.include_coverage === false) qs.set("include_coverage", "false");
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return hisFetch(`claims/${encodeURIComponent(claimId)}/$export-bundle${suffix}`);
}

export type MasterKind =
  | "billing-items"
  | "schedule-of-charges"
  | "gst-rates"
  | "payors"
  | "vendors"
  | "lab-catalog"
  | "imaging-catalog"
  | "payer-contracts"
  | "packages"
  | "payer-code-maps";

// --- Payer contracts / packages / pricing ---

export type PayerContractSummary = {
  id: string;
  title: string;
  hospital_id?: string;
  payor_org_id?: string;
  tpa_org_id?: string;
  category?: string;
  schedule_id?: string;
  cash_schedule_id?: string;
  effective_start?: string;
  effective_end?: string;
  version?: string;
  default_discount_percent: number;
  item_type_discounts?: { item_type: string; discount_percent: number }[];
  uncontracted_behavior: string;
  eligible_bed_category?: string;
  room_rent_cap_inr?: number;
  status?: string;
};

export type PayerContractListResponse = {
  contracts: PayerContractSummary[];
};

export type PayerContractUpsertRequest = {
  id?: string;
  title: string;
  hospital_id: string;
  payor_org_id: string;
  tpa_org_id?: string;
  category?: string;
  schedule_id: string;
  cash_schedule_id?: string;
  effective_from?: string;
  effective_to?: string;
  version?: string;
  supersedes_contract_id?: string;
  default_discount_percent?: number;
  item_type_discounts?: { item_type: string; discount_percent: number }[];
  uncontracted_behavior?: string;
  eligible_bed_category?: string;
  room_rent_cap_inr?: number;
};

export type PackageDefinitionSummary = {
  id: string;
  package_code: string;
  title: string;
  schedule_id?: string;
  payer_org_id?: string;
  bed_category?: string;
  package_amount_inr: number;
  included_los_days: number;
  included_item_types: string[];
  excluded_codes: string[];
  beyond_los_policy: string;
  per_day_rate_inr?: number;
  hsn_sac?: string;
  gst_rate_class?: string;
};

export type PackageListResponse = {
  packages: PackageDefinitionSummary[];
};

export type PackageUpsertRequest = {
  id?: string;
  package_code: string;
  title: string;
  schedule_id: string;
  payer_org_id?: string;
  bed_category?: string;
  package_amount_inr: number;
  included_los_days: number;
  included_item_types?: string[];
  excluded_codes?: string[];
  beyond_los_policy?: string;
  per_day_rate_inr?: number;
  hsn_sac?: string;
  gst_rate_class?: string;
  hospital_id?: string;
  effective_from?: string;
  effective_to?: string;
};

export type PackageCaseSummary = {
  id: string;
  encounter_id?: string;
  patient_id?: string;
  hospital_id?: string;
  package_code?: string;
  package_definition_id?: string;
  bed_category?: string;
  authorized_los_days: number;
  preauth_number?: string;
  contract_id?: string;
  coverage_id?: string;
  start_date?: string;
  status?: string;
};

export type OpenPackageCaseRequest = {
  encounter_id: string;
  hospital_id: string;
  package_code: string;
  package_definition_id?: string;
  bed_category?: string;
  authorized_los_days?: number;
  preauth_number?: string;
  contract_id?: string;
  coverage_id?: string;
  start_date?: string;
  id?: string;
  post_package_charge?: boolean;
};

export type PackageCaseResponse = {
  package_case: PackageCaseSummary;
  package_charge_id?: string;
};

export type PricingQuoteParams = {
  billing_code: string;
  encounter_id?: string;
  hospital_id?: string;
  schedule_id?: string;
  payer_org_id?: string;
  bed_category?: string;
  visit_class?: string;
  item_type?: string;
  los_day_index?: number;
};

export type PricingQuoteResponse = {
  billing_code: string;
  unit_price_inr: number;
  claimable_amount_inr: number;
  schedule_id?: string;
  gst_rate_class: string;
  hsn_sac?: string;
  definition_id?: string;
  title: string;
  item_type?: string;
  source: string;
  liability: string;
  contract_id?: string;
  discount_percent?: number;
  package_case_id?: string;
  notional_unit_price_inr?: number;
};

export async function listPayerContracts(params?: {
  hospital_id?: string;
  payor_org_id?: string;
}): Promise<PayerContractListResponse> {
  const qs = new URLSearchParams();
  if (params?.hospital_id) qs.set("hospital_id", params.hospital_id);
  if (params?.payor_org_id) qs.set("payor_org_id", params.payor_org_id);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return hisFetch(`payer-contracts${suffix}`);
}

export async function getPayerContract(id: string): Promise<PayerContractSummary> {
  return hisFetch(`payer-contracts/${encodeURIComponent(id)}`);
}

export async function upsertPayerContract(
  body: PayerContractUpsertRequest,
): Promise<PayerContractSummary> {
  return hisFetch("payer-contracts", { method: "POST", body: JSON.stringify(body) });
}

export async function listPackages(params?: {
  schedule_id?: string;
  payer_org_id?: string;
}): Promise<PackageListResponse> {
  const qs = new URLSearchParams();
  if (params?.schedule_id) qs.set("schedule_id", params.schedule_id);
  if (params?.payer_org_id) qs.set("payer_org_id", params.payer_org_id);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return hisFetch(`packages${suffix}`);
}

export async function getPackage(id: string): Promise<PackageDefinitionSummary> {
  return hisFetch(`packages/${encodeURIComponent(id)}`);
}

export async function upsertPackage(body: PackageUpsertRequest): Promise<PackageDefinitionSummary> {
  return hisFetch("packages", { method: "POST", body: JSON.stringify(body) });
}

export async function getPackageCase(
  encounterId: string,
): Promise<PackageCaseSummary | null> {
  return hisFetch(`encounters/${encodeURIComponent(encounterId)}/package-case`);
}

export async function openPackageCase(
  encounterId: string,
  body: OpenPackageCaseRequest,
): Promise<PackageCaseResponse> {
  return hisFetch(`encounters/${encodeURIComponent(encounterId)}/package-case`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function quotePrice(params: PricingQuoteParams): Promise<PricingQuoteResponse> {
  const qs = new URLSearchParams();
  qs.set("billing_code", params.billing_code);
  if (params.encounter_id) qs.set("encounter_id", params.encounter_id);
  if (params.hospital_id) qs.set("hospital_id", params.hospital_id);
  if (params.schedule_id) qs.set("schedule_id", params.schedule_id);
  if (params.payer_org_id) qs.set("payer_org_id", params.payer_org_id);
  if (params.bed_category) qs.set("bed_category", params.bed_category);
  if (params.visit_class) qs.set("visit_class", params.visit_class);
  if (params.item_type) qs.set("item_type", params.item_type);
  if (params.los_day_index != null) qs.set("los_day_index", String(params.los_day_index));
  return hisFetch(`pricing/quote?${qs.toString()}`);
}

export type MasterUploadRequest = {
  kind: MasterKind;
  dry_run?: boolean;
  csv?: string;
  xlsx_base64?: string;
  hospital_id?: string;
  schedule_id?: string;
};

export type MasterUploadRowError = {
  row: number;
  message: string;
};

export type MasterUploadResponse = {
  kind: MasterKind;
  dry_run: boolean;
  accepted: number;
  rejected: number;
  errors: MasterUploadRowError[];
  resource_ids: string[];
};

export async function uploadMasters(
  body: MasterUploadRequest,
): Promise<MasterUploadResponse> {
  return hisFetch("masters/upload", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function ingestClaimResponse(
  claimId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return hisFetch(`claims/${encodeURIComponent(claimId)}/claim-response`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
