import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {BffError, formatApiError} from "../api/bff";
import {
  bookAppointment,
  cancelAppointment,
  checkDuplicates,
  findSlots,
  getRegistrationChoices,
  listBookingDoctors,
  listPatients,
  lookupPatientAppointment,
  registerPatient,
  rescheduleAppointment,
  type DuplicateMatch,
  type PatientSummary,
  type RegistrationChoicesResponse,
  type SlotSummary,
} from "../api/his";
import AdminLayout from "../components/AdminLayout";
import CodedSelect from "../components/CodedSelect";
import SlotPicker from "../components/SlotPicker";
import WorkflowStepper from "../components/WorkflowStepper";
import { useAuth } from "../context/AuthContext";
import {
  DEFAULT_BOOKING_DOCTORS,
  filterDoctorsForHospital,
  type BookingDoctor,
  todayIsoDate,
  formatSlotTime,
} from "../constants";
import {
  DEFAULT_REGISTRATION_CHOICES,
  buildRegisterRequest,
  validateRegistrationForm,
} from "../utils/registrationValidation";
import {
  clearOpdWorkflowResume,
  readOpdWorkflowResume,
  writeOpdWorkflowResume,
} from "../utils/opdWorkflowResume";

export default function OpdWorkflowPage() {
  const { session } = useAuth();
  const [familyName, setFamilyName] = useState("AdminDemo");
  const [givenName, setGivenName] = useState("Patient");
  const [gender, setGender] = useState("female");
  const [birthDate, setBirthDate] = useState("1992-05-20");
  const [phoneValue, setPhoneValue] = useState("+91-9000000099");
  const [telecomSystem, setTelecomSystem] = useState("phone");
  const [telecomUse, setTelecomUse] = useState("mobile");
  const [includeAddress, setIncludeAddress] = useState(true);
  const [addressUse, setAddressUse] = useState("home");
  const [addressLine, setAddressLine] = useState("1 Admin Street");
  const [addressCity, setAddressCity] = useState("Bengaluru");
  const [addressState, setAddressState] = useState("KA");
  const [addressPostal, setAddressPostal] = useState("560001");
  const [addressCountry, setAddressCountry] = useState("IN");
  const [registrationChoices, setRegistrationChoices] =
    useState<RegistrationChoicesResponse>(DEFAULT_REGISTRATION_CHOICES);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState(todayIsoDate());
  const [doctors, setDoctors] = useState<BookingDoctor[]>(DEFAULT_BOOKING_DOCTORS);
  const [selectedPractitionerId, setSelectedPractitionerId] = useState(
    DEFAULT_BOOKING_DOCTORS[0]?.practitioner_id ?? "",
  );
  const [doctorsLoading, setDoctorsLoading] = useState(true);

  const [patientId, setPatientId] = useState<string | null>(null);
  const [mrn, setMrn] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<SlotSummary[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [bookedSlotLabel, setBookedSlotLabel] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [cancelReason, setCancelReason] = useState("Patient requested cancellation");
  const [recentPatients, setRecentPatients] = useState<PatientSummary[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientFilter, setPatientFilter] = useState("");

  const [stepStatus, setStepStatus] = useState<Record<number, string | null>>({});
  const [stepError, setStepError] = useState<Record<number, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [resumeChecked, setResumeChecked] = useState(false);

  const patientLabel = (() => {
    if (!patientId) return null;
    const fromList = recentPatients.find((p) => p.patient_id === patientId)?.name;
    if (fromList) return fromList;
    const fromForm = `${givenName} ${familyName}`.trim();
    return fromForm || patientId;
  })();
  const selectedDoctor =
    doctors.find((d) => d.practitioner_id === selectedPractitionerId) ?? doctors[0] ?? null;

  useEffect(() => {
    void (async () => {
      setDoctorsLoading(true);
      try {
        const res = await listBookingDoctors(session?.hospital_id);
        const scoped = filterDoctorsForHospital(
          res.doctors.length > 0 ? res.doctors : DEFAULT_BOOKING_DOCTORS,
          session?.hospital_id,
        );
        setDoctors(scoped);
        setSelectedPractitionerId((current) =>
          scoped.some((d) => d.practitioner_id === current)
            ? current
            : scoped[0]?.practitioner_id ?? "",
        );
      } catch {
        const scoped = filterDoctorsForHospital(DEFAULT_BOOKING_DOCTORS, session?.hospital_id);
        setDoctors(scoped);
        setSelectedPractitionerId(scoped[0]?.practitioner_id ?? "");
      } finally {
        setDoctorsLoading(false);
      }
    })();
  }, [session?.hospital_id]);

  const loadRecentPatients = useCallback(async (name?: string) => {
    setPatientsLoading(true);
    try {
      const res = await listPatients({
        name: name?.trim() || undefined,
        _count: 50,
      });
      setRecentPatients(res.patients);
    } catch {
      setRecentPatients([]);
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecentPatients();
  }, [loadRecentPatients]);

  useEffect(() => {
    void (async () => {
      try {
        const choices = await getRegistrationChoices();
        setRegistrationChoices(choices);
      } catch {
        setRegistrationChoices(DEFAULT_REGISTRATION_CHOICES);
      }
    })();
  }, []);

  const registrationFormValues = {
    familyName,
    givenName,
    gender,
    birthDate,
    phoneValue,
    telecomSystem,
    telecomUse,
    includeAddress,
    addressUse,
    addressLine,
    addressCity,
    addressState,
    addressPostal,
    addressCountry,
  };

  const syncBookedAppointment = useCallback(
    async (pid: string, date: string, practitionerId: string, doctorName?: string) => {
      const lookup = await lookupPatientAppointment({
        patient_id: pid,
        date,
        practitioner_id: practitionerId,
      });
      if (lookup.appointment) {
        setAppointmentId(lookup.appointment.appointment_id);
        setBookedSlotLabel(
          lookup.appointment.start ? formatSlotTime(lookup.appointment.start) : null,
        );
        setRescheduleMode(false);
        const slotLabel = lookup.appointment.start
          ? formatSlotTime(lookup.appointment.start)
          : "appointment";
        setStepStatus((prev) => ({
          ...prev,
          2: `Booked with ${doctorName ?? "doctor"} · ${slotLabel} on ${date}`,
        }));
      } else {
        setAppointmentId(null);
        setBookedSlotLabel(null);
      }
    },
    [],
  );

  useEffect(() => {
    if (doctorsLoading || resumeChecked) return;
    const resume = readOpdWorkflowResume();
    if (!resume) {
      setResumeChecked(true);
      return;
    }

    void (async () => {
      try {
        setPatientId(resume.patientId);
        if (resume.mrn) setMrn(resume.mrn);
        if (resume.givenName) setGivenName(resume.givenName);
        if (resume.familyName) setFamilyName(resume.familyName);
        setAppointmentDate(resume.appointmentDate);
        setSelectedPractitionerId(resume.practitionerId);
        const doctor =
          doctors.find((d) => d.practitioner_id === resume.practitionerId) ?? selectedDoctor;
        const registeredLabel = resume.mrn
          ? `Registered ${resume.givenName ?? ""} ${resume.familyName ?? ""} · MRN ${resume.mrn}`.trim()
          : "Patient restored from previous session";
        setStepStatus((prev) => ({ ...prev, 1: registeredLabel }));
        await syncBookedAppointment(
          resume.patientId,
          resume.appointmentDate,
          resume.practitionerId,
          doctor?.name,
        );
      } catch {
        // Ignore stale resume; user can continue manually.
      } finally {
        setResumeChecked(true);
      }
    })();
  }, [doctorsLoading, resumeChecked, doctors, selectedDoctor, syncBookedAppointment]);

  useEffect(() => {
    if (!resumeChecked) return;
    if (!patientId) {
      clearOpdWorkflowResume();
      return;
    }
    writeOpdWorkflowResume({
      patientId,
      mrn: mrn ?? undefined,
      givenName,
      familyName,
      appointmentDate,
      practitionerId: selectedPractitionerId,
    });
  }, [
    resumeChecked,
    patientId,
    mrn,
    givenName,
    familyName,
    appointmentDate,
    selectedPractitionerId,
  ]);

  const loadSlotsForDate = useCallback(async (date: string, doctor: BookingDoctor | null) => {
    if (!date || !doctor) return;
    setSlotsLoading(true);
    setStepError((prev) => ({ ...prev, 2: null }));
    setSelectedSlotId(null);
    setAvailableSlots([]);
    setStepStatus((prev) => ({ ...prev, 2: `Loading slots for ${doctor.name} on ${date}…` }));
    try {
      const slots = await findSlots({
        schedule_id: doctor.schedule_id,
        start: date,
        end: date,
        practitioner_id: doctor.practitioner_id,
      });
      setAvailableSlots(slots.slots);
      setStepStatus((prev) => ({
        ...prev,
        2:
          slots.count < 1
            ? `No free slots for ${doctor.name} on ${date}`
            : `${slots.count} free slot(s) for ${doctor.name} — select one to book`,
      }));
    } catch (err) {
      setStepError((prev) => ({
        ...prev,
        2: formatApiError(err),
      }));
      setStepStatus((prev) => ({ ...prev, 2: null }));
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!appointmentId || rescheduleMode) {
      void loadSlotsForDate(appointmentDate, selectedDoctor);
    }
  }, [appointmentDate, appointmentId, rescheduleMode, selectedDoctor, loadSlotsForDate]);

  async function runStep(step: number, label: string, fn: () => Promise<void>) {
    setBusy(true);
    setStepError((prev) => ({ ...prev, [step]: null }));
    setStepStatus((prev) => ({ ...prev, [step]: label }));
    try {
      await fn();
    } catch (err) {
      setStepError((prev) => ({
        ...prev,
        [step]: formatApiError(err),
      }));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setStepError((prev) => ({ ...prev, 1: null }));

    const errors = validateRegistrationForm(registrationFormValues, registrationChoices);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStepError((prev) => ({ ...prev, 1: "Fix the highlighted fields before registering." }));
      return;
    }

    setBusy(true);
    try {
      if (!allowDuplicates) {
        setStepStatus((prev) => ({ ...prev, 1: "Checking for duplicates…" }));
        const summary = await checkDuplicates(
          buildRegisterRequest(registrationFormValues, false),
        );
        if (summary.count > 0) {
          setDuplicateMatches(summary.matches);
          setStepStatus((prev) => ({
            ...prev,
            1: `${summary.count} possible duplicate(s) — review and register anyway if intended`,
          }));
          return;
        }
      }

      setStepStatus((prev) => ({ ...prev, 1: "Registering patient…" }));
      const res = await registerPatient(
        buildRegisterRequest(registrationFormValues, allowDuplicates),
      );
      setPatientId(res.patient_id);
      setMrn(res.mrn);
      setDuplicateMatches([]);
      setAllowDuplicates(false);
      setStepStatus((prev) => ({
        ...prev,
        1: `Registered ${givenName} ${familyName} · MRN ${res.mrn}`,
      }));
      void loadRecentPatients();
    } catch (err) {
      if (err instanceof BffError && err.isDuplicatePatient && err.body.duplicates) {
        setDuplicateMatches(err.body.duplicates);
      }
      setStepError((prev) => ({
        ...prev,
        1: formatApiError(err),
      }));
      setStepStatus((prev) => ({ ...prev, 1: null }));
    } finally {
      setBusy(false);
    }
  }

  async function onRegisterDespiteDuplicates() {
    setAllowDuplicates(true);
    setStepError((prev) => ({ ...prev, 1: null }));
    setBusy(true);
    try {
      setStepStatus((prev) => ({ ...prev, 1: "Registering patient…" }));
      const res = await registerPatient(
        buildRegisterRequest(registrationFormValues, true),
      );
      setPatientId(res.patient_id);
      setMrn(res.mrn);
      setDuplicateMatches([]);
      setAllowDuplicates(false);
      setStepStatus((prev) => ({
        ...prev,
        1: `Registered ${givenName} ${familyName} · MRN ${res.mrn}`,
      }));
      void loadRecentPatients();
    } catch (err) {
      setStepError((prev) => ({
        ...prev,
        1: formatApiError(err),
      }));
      setStepStatus((prev) => ({ ...prev, 1: null }));
    } finally {
      setBusy(false);
    }
  }

  function onPickPatient(nextId: string) {
    if (!nextId) {
      setPatientId(null);
      setMrn(null);
      setAppointmentId(null);
      setBookedSlotLabel(null);
      setStepStatus((prev) => ({ ...prev, 1: null, 2: null }));
      return;
    }
    const selected = recentPatients.find((p) => p.patient_id === nextId);
    setPatientId(nextId);
    setMrn(selected?.mrn ?? null);
    setAppointmentId(null);
    setBookedSlotLabel(null);
    setRescheduleMode(false);
    setSelectedSlotId(null);
    if (selected?.name) {
      const parts = selected.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        setGivenName(parts.slice(0, -1).join(" "));
        setFamilyName(parts[parts.length - 1] ?? "");
      } else if (parts.length === 1) {
        setGivenName(parts[0] ?? "");
      }
    }
    setStepStatus((prev) => ({
      ...prev,
      1: `Selected ${selected?.name ?? nextId}${selected?.mrn ? ` · MRN ${selected.mrn}` : ""}`,
      2: null,
    }));
    setStepError((prev) => ({ ...prev, 1: null, 2: null }));
    void syncBookedAppointment(nextId, appointmentDate, selectedPractitionerId, selectedDoctor?.name);
  }

  function onAppointmentDateChange(date: string) {
    setAppointmentDate(date);
    setAppointmentId(null);
    setBookedSlotLabel(null);
    if (patientId && resumeChecked) {
      void syncBookedAppointment(
        patientId,
        date,
        selectedPractitionerId,
        selectedDoctor?.name,
      );
    }
  }

  function onDoctorChange(practitionerId: string) {
    setSelectedPractitionerId(practitionerId);
    setSelectedSlotId(null);
    if (!appointmentId) {
      setBookedSlotLabel(null);
    }
    if (patientId && resumeChecked) {
      const doctor = doctors.find((d) => d.practitioner_id === practitionerId);
      void syncBookedAppointment(patientId, appointmentDate, practitionerId, doctor?.name);
    }
  }

  async function onBook() {
    if (!patientId) {
      setStepError((prev) => ({ ...prev, 2: "Select or register a patient first" }));
      return;
    }
    if (!selectedDoctor) {
      setStepError((prev) => ({ ...prev, 2: "Select a doctor" }));
      return;
    }
    if (!selectedSlotId) {
      setStepError((prev) => ({ ...prev, 2: "Select an available slot" }));
      return;
    }
    const slot = availableSlots.find((s) => s.slot_id === selectedSlotId);
    const slotLabel = slot ? formatSlotTime(slot.start) : selectedSlotId;

    if (rescheduleMode && appointmentId) {
      await runStep(2, "Rescheduling appointment…", async () => {
        await rescheduleAppointment(appointmentId, { new_slot_id: selectedSlotId });
        setBookedSlotLabel(slotLabel);
        setRescheduleMode(false);
        setStepStatus((prev) => ({
          ...prev,
          2: `Rescheduled to ${slotLabel} on ${appointmentDate}`,
        }));
      });
      return;
    }

    await runStep(2, "Booking appointment…", async () => {
      const res = await bookAppointment({
        patient_id: patientId,
        slot_id: selectedSlotId,
        practitioner_id: selectedDoctor.practitioner_id,
        location_id: selectedDoctor.location_id,
        description: `Admin UI booking — ${selectedDoctor.name}`,
      });
      setAppointmentId(res.appointment_id);
      setBookedSlotLabel(slotLabel);
      setRescheduleMode(false);
      setStepStatus((prev) => ({
        ...prev,
        2: `Booked with ${selectedDoctor.name} · ${slotLabel} on ${appointmentDate}`,
      }));
    });
  }

  async function onCancelAppointment() {
    if (!appointmentId) return;
    await runStep(2, "Cancelling appointment…", async () => {
      await cancelAppointment(appointmentId, { reason: cancelReason.trim() || undefined });
      setAppointmentId(null);
      setBookedSlotLabel(null);
      setSelectedSlotId(null);
      setRescheduleMode(false);
      setStepStatus((prev) => ({ ...prev, 2: "Appointment cancelled — slot released" }));
      void loadSlotsForDate(appointmentDate, selectedDoctor);
    });
  }

  function resetWorkflow() {
    clearOpdWorkflowResume();
    setPatientId(null);
    setMrn(null);
    setAppointmentId(null);
    setBookedSlotLabel(null);
    setRescheduleMode(false);
    setSelectedSlotId(null);
    setDuplicateMatches([]);
    setAllowDuplicates(false);
    setFieldErrors({});
    setStepStatus({});
    setStepError({});
    void loadSlotsForDate(appointmentDate, selectedDoctor);
  }

  const canBook =
    Boolean(patientId && selectedDoctor && selectedSlotId && !busy && !slotsLoading) &&
    (!appointmentId || rescheduleMode);
  const showSlotPicker = !appointmentId || rescheduleMode;

  const steps = [
    { id: 1, label: "Register", done: Boolean(patientId), active: !patientId },
    { id: 2, label: "Book", done: Boolean(appointmentId), active: Boolean(patientId) && !appointmentId },
  ];

  return (
    <AdminLayout
      title="OPD front desk"
      subtitle="Register patients and book appointments"
    >
      <WorkflowStepper steps={steps} />

      <div className="row workflow-actions">
        <button type="button" className="secondary" onClick={resetWorkflow} disabled={busy}>
          Reset workflow
        </button>
        {patientLabel ? <span className="badge">{patientLabel}{mrn ? ` · MRN ${mrn}` : ""}</span> : null}
      </div>

      <section className={`card${patientId ? " step-done" : ""}`}>
        <h2>1. Register patient</h2>
        <form className="form grid-2" onSubmit={onRegister}>
          <label>
            Family name *
            <input
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              required
              aria-invalid={Boolean(fieldErrors.familyName)}
            />
            {fieldErrors.familyName ? <span className="error">{fieldErrors.familyName}</span> : null}
          </label>
          <label>
            Given name *
            <input
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              required
              aria-invalid={Boolean(fieldErrors.givenName)}
            />
            {fieldErrors.givenName ? <span className="error">{fieldErrors.givenName}</span> : null}
          </label>
          <CodedSelect
            label="Gender"
            value={gender}
            options={registrationChoices.gender}
            onChange={setGender}
            required
          />
          {fieldErrors.gender ? <span className="error">{fieldErrors.gender}</span> : null}
          <label>
            Birth date *
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              aria-invalid={Boolean(fieldErrors.birthDate)}
            />
            {fieldErrors.birthDate ? <span className="error">{fieldErrors.birthDate}</span> : null}
          </label>

          <fieldset className="grid-2">
            <legend>Contact (optional)</legend>
            <CodedSelect
              label="Contact type"
              value={telecomSystem}
              options={registrationChoices.telecom_system}
              onChange={setTelecomSystem}
            />
            <CodedSelect
              label="Contact use"
              value={telecomUse}
              options={registrationChoices.telecom_use}
              onChange={setTelecomUse}
            />
            <label>
              Phone or email
              <input
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                placeholder="+91-9000000099"
              />
            </label>
          </fieldset>

          <fieldset className="grid-2">
            <legend>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={includeAddress}
                  onChange={(e) => setIncludeAddress(e.target.checked)}
                />
                Include address
              </label>
            </legend>
            {includeAddress ? (
              <>
                <CodedSelect
                  label="Address use"
                  value={addressUse}
                  options={registrationChoices.address_use}
                  onChange={setAddressUse}
                />
                <label>
                  Street line *
                  <input
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.addressLine)}
                  />
                  {fieldErrors.addressLine ? (
                    <span className="error">{fieldErrors.addressLine}</span>
                  ) : null}
                </label>
                <label>
                  City
                  <input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} />
                </label>
                <label>
                  State
                  <input value={addressState} onChange={(e) => setAddressState(e.target.value)} />
                </label>
                <label>
                  Postal code
                  <input value={addressPostal} onChange={(e) => setAddressPostal(e.target.value)} />
                </label>
                <label>
                  Country
                  <input value={addressCountry} onChange={(e) => setAddressCountry(e.target.value)} />
                </label>
              </>
            ) : null}
          </fieldset>

          <div className="row">
            <button type="submit" disabled={busy}>
              Register
            </button>
            {duplicateMatches.length > 0 ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void onRegisterDespiteDuplicates()}
              >
                Register anyway ({duplicateMatches.length} duplicate
                {duplicateMatches.length === 1 ? "" : "s"})
              </button>
            ) : null}
          </div>
        </form>

        {duplicateMatches.length > 0 ? (
          <div className="duplicate-panel">
            <p className="status">Possible duplicates</p>
            <ul>
              {duplicateMatches.map((match) => (
                <li key={match.patient_id}>
                  {match.name ?? match.patient_id}
                  {match.mrn ? ` · MRN ${match.mrn}` : ""}
                  {match.birth_date ? ` · DOB ${match.birth_date}` : ""}
                  <span className="muted"> ({match.match_reason})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {stepStatus[1] ? <p className="success">{stepStatus[1]}</p> : null}
        {stepError[1] ? <p className="error">{stepError[1]}</p> : null}
        {!patientId ? (
          <p className="muted">Register a new patient above, or pick an existing one in step 2.</p>
        ) : null}
      </section>

      <section className={`card${appointmentId ? " step-done" : ""}`}>
        <h2>2. Book appointment</h2>

        <div className="form" style={{ marginBottom: "1rem" }}>
          <label>
            Patient
            <select
              value={patientId ?? ""}
              onChange={(e) => onPickPatient(e.target.value)}
              disabled={busy || patientsLoading || Boolean(appointmentId && !rescheduleMode)}
            >
              <option value="">
                {patientsLoading ? "Loading patients…" : "Select an existing patient…"}
              </option>
              {recentPatients.map((patient) => (
                <option key={patient.patient_id} value={patient.patient_id}>
                  {patient.name ?? patient.patient_id}
                  {patient.mrn ? ` · ${patient.mrn}` : ""}
                  {patient.birth_date ? ` · ${patient.birth_date}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <label style={{ flex: 1 }}>
              Filter by name
              <input
                value={patientFilter}
                placeholder="e.g. Patel"
                disabled={busy || patientsLoading}
                onChange={(e) => setPatientFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void loadRecentPatients(patientFilter);
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="secondary"
              disabled={busy || patientsLoading}
              onClick={() => void loadRecentPatients(patientFilter)}
            >
              {patientsLoading ? "Searching…" : "Search"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || patientsLoading}
              onClick={() => {
                setPatientFilter("");
                void loadRecentPatients();
              }}
            >
              Recent
            </button>
          </div>
          {!patientId ? (
            <p className="muted">Pick a patient to load slots, or register one in step 1.</p>
          ) : null}
        </div>

        {appointmentId && !rescheduleMode ? (
          <div className="booking-summary">
            <p className="success">
              Booked with {selectedDoctor?.name ?? "doctor"} · {bookedSlotLabel ?? "appointment"} on{" "}
              {appointmentDate}
            </p>
            <div className="form">
              <label>
                Cancellation reason
                <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </label>
              <div className="row">
                <button type="button" className="secondary" disabled={busy} onClick={() => setRescheduleMode(true)}>
                  Reschedule
                </button>
                <button type="button" className="danger" disabled={busy} onClick={() => void onCancelAppointment()}>
                  Cancel appointment
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="form">
            {rescheduleMode ? (
              <p className="status">Pick a new slot, then confirm reschedule.</p>
            ) : null}
            <label>
              Doctor
              <select
                value={selectedPractitionerId}
                onChange={(e) => onDoctorChange(e.target.value)}
                disabled={busy || slotsLoading || doctorsLoading || Boolean(appointmentId && !rescheduleMode)}
              >
                {doctors.map((doctor) => (
                  <option key={doctor.practitioner_id} value={doctor.practitioner_id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
            </label>
            {doctorsLoading ? <p className="muted">Loading doctors…</p> : null}
            <label>
              Appointment date
              <input
                type="date"
                value={appointmentDate}
                min={todayIsoDate()}
                onChange={(e) => onAppointmentDateChange(e.target.value)}
                disabled={busy || slotsLoading}
              />
            </label>

            {slotsLoading ? <p className="muted">Loading available slots…</p> : null}

            {showSlotPicker ? (
              <SlotPicker
                slots={availableSlots}
                selectedSlotId={selectedSlotId}
                disabled={busy || slotsLoading}
                onSelect={(slotId) => {
                  setSelectedSlotId(slotId);
                  setStepError((prev) => ({ ...prev, 2: null }));
                  const slot = availableSlots.find((s) => s.slot_id === slotId);
                  if (slot) {
                    setStepStatus((prev) => ({
                      ...prev,
                      2: `Selected ${formatSlotTime(slot.start)}`,
                    }));
                  }
                }}
              />
            ) : null}

            {!slotsLoading && appointmentDate && availableSlots.length === 0 && !appointmentId ? (
              <p className="muted">No free slots on this date — try another day.</p>
            ) : null}

            <div className="row">
              {showSlotPicker ? (
                <button type="button" onClick={() => void onBook()} disabled={!canBook}>
                  {rescheduleMode ? "Confirm reschedule" : "Book selected slot"}
                </button>
              ) : null}
              {rescheduleMode ? (
                <button type="button" className="secondary" disabled={busy} onClick={() => setRescheduleMode(false)}>
                  Cancel reschedule
                </button>
              ) : null}
              <button type="button" className="secondary" disabled={busy || slotsLoading || !selectedDoctor} onClick={() => void loadSlotsForDate(appointmentDate, selectedDoctor)}>
                Refresh slots
              </button>
            </div>
          </div>
        )}

        {stepStatus[2] ? <p className="status">{stepStatus[2]}</p> : null}
        {stepError[2] ? <p className="error">{stepError[2]}</p> : null}
      </section>
    </AdminLayout>
  );
}
