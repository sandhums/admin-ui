import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createOpdSchedule,
  createPractitioner,
  expandScheduleSlots,
  findSlots,
  listBookingDoctors,
  listHospitals,
  listPractitioners,
  type HospitalSummary,
  type PractitionerSummary,
  type SlotSummary,
} from "../api/his";
import AdminLayout from "../components/AdminLayout";
import { hasPermission } from "../components/RequirePermission";
import { useAuth } from "../context/AuthContext";
import {
  DEFAULT_BOOKING_DOCTORS,
  campusForHospital,
  filterDoctorsForHospital,
  formatSlotDate,
  formatSlotTime,
  todayIsoDate,
  type BookingDoctor,
} from "../constants";

const WEEKDAYS = [
  { code: "MO", label: "Mon" },
  { code: "TU", label: "Tue" },
  { code: "WE", label: "Wed" },
  { code: "TH", label: "Thu" },
  { code: "FR", label: "Fri" },
  { code: "SA", label: "Sat" },
  { code: "SU", label: "Sun" },
] as const;

const DEFAULT_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"];

function defaultScheduleId(practitionerId: string): string {
  const slug = practitionerId.replace(/^dr[.-]?/i, "");
  return `opd-${slug || practitionerId}-schedule`;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function SchedulingBoardPage() {
  const { session } = useAuth();
  const [hospitals, setHospitals] = useState<HospitalSummary[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [expandToDate, setExpandToDate] = useState(() => addDays(todayIsoDate(), 6));
  const [doctors, setDoctors] = useState<BookingDoctor[]>([]);
  const [selectedPractitionerId, setSelectedPractitionerId] = useState("");
  const [hospitalsLoading, setHospitalsLoading] = useState(true);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [practitioners, setPractitioners] = useState<PractitionerSummary[]>([]);
  const [practitionersLoading, setPractitionersLoading] = useState(false);
  const [creatingPractitioner, setCreatingPractitioner] = useState(false);
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [practitionerIdInput, setPractitionerIdInput] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [givenName, setGivenName] = useState("");
  const [namePrefix, setNamePrefix] = useState("Dr.");
  const [gender, setGender] = useState("unknown");
  const [schedulePractitionerId, setSchedulePractitionerId] = useState("");
  const [scheduleIdInput, setScheduleIdInput] = useState("");
  const [weekdays, setWeekdays] = useState<string[]>(DEFAULT_WEEKDAYS);
  const [scheduleHour, setScheduleHour] = useState(9);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [horizonStart, setHorizonStart] = useState(todayIsoDate());
  const [horizonEnd, setHorizonEnd] = useState(() => addDays(todayIsoDate(), 14));

  const canProvisionSchedules =
    hasPermission(session, "scheduling:provision") || hasPermission(session, "config:write");
  const canAdminSchedules = hasPermission(session, "config:write");

  const selectedHospital = useMemo(
    () => hospitals.find((h) => h.id === selectedHospitalId) ?? null,
    [hospitals, selectedHospitalId],
  );

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.practitioner_id === selectedPractitionerId) ?? doctors[0] ?? null,
    [doctors, selectedPractitionerId],
  );

  useEffect(() => {
    let cancelled = false;
    setHospitalsLoading(true);
    void listHospitals()
      .then((res) => {
        if (cancelled) return;
        setHospitals(res.hospitals);
        setSelectedHospitalId((current) => {
          if (current && res.hospitals.some((h) => h.id === current)) {
            return current;
          }
          if (session?.hospital_id && res.hospitals.some((h) => h.id === session.hospital_id)) {
            return session.hospital_id;
          }
          return res.hospitals[0]?.id ?? "";
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setHospitals([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHospitalsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.hospital_id]);

  useEffect(() => {
    if (!selectedHospitalId) {
      setDoctors([]);
      setSelectedPractitionerId("");
      return;
    }

    let cancelled = false;
    setDoctorsLoading(true);
    setError(null);
    void listBookingDoctors(selectedHospitalId)
      .then((res) => {
        if (cancelled) return;
        const scoped = filterDoctorsForHospital(
          res.doctors.length > 0 ? res.doctors : DEFAULT_BOOKING_DOCTORS,
          selectedHospitalId,
        );
        setDoctors(scoped);
        setSelectedPractitionerId((current) =>
          scoped.some((d) => d.practitioner_id === current)
            ? current
            : scoped[0]?.practitioner_id ?? "",
        );
      })
      .catch(() => {
        if (cancelled) return;
        const scoped = filterDoctorsForHospital(DEFAULT_BOOKING_DOCTORS, selectedHospitalId);
        setDoctors(scoped);
        setSelectedPractitionerId(scoped[0]?.practitioner_id ?? "");
      })
      .finally(() => {
        if (!cancelled) {
          setDoctorsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedHospitalId]);

  const reloadDoctors = useCallback(async () => {
    if (!selectedHospitalId) return;
    const res = await listBookingDoctors(selectedHospitalId);
    const scoped = filterDoctorsForHospital(
      res.doctors.length > 0 ? res.doctors : DEFAULT_BOOKING_DOCTORS,
      selectedHospitalId,
    );
    setDoctors(scoped);
    setSelectedPractitionerId((current) =>
      scoped.some((d) => d.practitioner_id === current)
        ? current
        : scoped[0]?.practitioner_id ?? "",
    );
  }, [selectedHospitalId]);

  useEffect(() => {
    if (!canProvisionSchedules) {
      setPractitioners([]);
      return;
    }
    let cancelled = false;
    setPractitionersLoading(true);
    void listPractitioners()
      .then((res) => {
        if (cancelled) return;
        setPractitioners(res.practitioners);
        setSchedulePractitionerId((current) => {
          if (current && res.practitioners.some((p) => p.practitioner_id === current)) {
            return current;
          }
          return res.practitioners[0]?.practitioner_id ?? "";
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPractitioners([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPractitionersLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canProvisionSchedules]);

  useEffect(() => {
    if (schedulePractitionerId) {
      setScheduleIdInput(defaultScheduleId(schedulePractitionerId));
    }
  }, [schedulePractitionerId]);

  useEffect(() => {
    setExpandToDate(addDays(date, 6));
  }, [date]);

  const loadBoard = useCallback(async () => {
    if (!date || !selectedDoctor) return;
    setLoading(true);
    setError(null);
    try {
      const res = await findSlots({
        schedule_id: selectedDoctor.schedule_id,
        start: date,
        end: date,
      });
      setSlots(res.slots);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [date, selectedDoctor]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  async function onExpandSlots() {
    if (!selectedDoctor || !canProvisionSchedules) return;
    setExpanding(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await expandScheduleSlots(selectedDoctor.schedule_id, {
        from: date,
        to: expandToDate,
        hospitalId: selectedHospitalId,
      });
      setFeedback(
        `Generated ${result.slots_created} slot(s) for ${selectedDoctor.name} (${result.from} → ${result.to}).`,
      );
      await loadBoard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExpanding(false);
    }
  }

  async function onCreatePractitioner(event: FormEvent) {
    event.preventDefault();
    if (!canAdminSchedules) return;
    setCreatingPractitioner(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await createPractitioner({
        practitioner_id: practitionerIdInput.trim(),
        family_name: familyName.trim(),
        given_names: givenName
          .split(/[\s,]+/)
          .map((part) => part.trim())
          .filter(Boolean),
        prefix: namePrefix.trim() ? [namePrefix.trim()] : undefined,
        gender,
      });
      setFeedback(`Created FHIR Practitioner ${result.name} (${result.practitioner_id}).`);
      setPractitionerIdInput("");
      setFamilyName("");
      setGivenName("");
      const listed = await listPractitioners();
      setPractitioners(listed.practitioners);
      setSchedulePractitionerId(result.practitioner_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingPractitioner(false);
    }
  }

  async function onCreateSchedule(event: FormEvent) {
    event.preventDefault();
    if (!canProvisionSchedules || !selectedHospitalId || !schedulePractitionerId) return;
    setCreatingSchedule(true);
    setError(null);
    setFeedback(null);
    try {
      const campusId = campusForHospital(selectedHospitalId);
      const result = await createOpdSchedule({
        schedule_id: scheduleIdInput.trim(),
        practitioner_id: schedulePractitionerId,
        hospital_id: campusId ? undefined : selectedHospitalId,
        campus_id: campusId,
        weekdays,
        hour: scheduleHour,
        minute: scheduleMinute,
        planning_horizon_start: `${horizonStart}T00:00:00+05:30`,
        planning_horizon_end: `${horizonEnd}T00:00:00+05:30`,
        timezone: "Asia/Kolkata",
      });
      setFeedback(
        `Created OPD schedule ${result.schedule_id} for ${result.practitioner_id} at ${result.campus_id}.`,
      );
      await reloadDoctors();
      setSelectedPractitionerId(result.practitioner_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingSchedule(false);
    }
  }

  function toggleWeekday(code: string) {
    setWeekdays((current) =>
      current.includes(code) ? current.filter((day) => day !== code) : [...current, code],
    );
  }

  const morning = slots.filter((s) => new Date(s.start).getHours() < 12);
  const afternoon = slots.filter((s) => new Date(s.start).getHours() >= 12);

  return (
    <AdminLayout title="Scheduling board" subtitle="OPD schedules and bookable slots by hospital">
      <section className="card config-meta">
        <h2>Scope</h2>
        <p className="muted">
          Pick a hospital and doctor. OPD slots come from the doctor&apos;s FHIR{" "}
          <code>Schedule</code> (seeded or expanded below).
        </p>
        {hospitalsLoading ? <p className="muted">Loading hospitals…</p> : null}
        {hospitals.length > 0 ? (
          <label className="scope-selector">
            <span>Hospital</span>
            <select
              value={selectedHospitalId}
              disabled={hospitalsLoading || loading || expanding}
              onChange={(e) => {
                setSelectedHospitalId(e.target.value);
                setFeedback(null);
              }}
            >
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name} ({hospital.id})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      <section className="card">
        <div className="board-toolbar">
          <label>
            Doctor
            <select
              value={selectedPractitionerId}
              disabled={doctorsLoading || loading || expanding || doctors.length === 0}
              onChange={(e) => setSelectedPractitionerId(e.target.value)}
            >
              {doctors.map((doctor) => (
                <option key={doctor.practitioner_id} value={doctor.practitioner_id}>
                  {doctor.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            View date
            <input
              type="date"
              value={date}
              min={todayIsoDate()}
              disabled={loading || expanding}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button type="button" className="secondary" onClick={() => void loadBoard()} disabled={loading}>
            Refresh slots
          </button>
          {lastUpdated ? (
            <span className="muted">Updated {lastUpdated.toLocaleTimeString()}</span>
          ) : null}
        </div>

        {doctorsLoading ? <p className="muted">Loading doctors for {selectedHospital?.name ?? "hospital"}…</p> : null}
        {!doctorsLoading && doctors.length === 0 ? (
          <p className="muted">
            No OPD schedules for <code>{selectedHospitalId}</code>. Run{" "}
            <code>seed-hospital-foundation.py</code> or create a Schedule in FHIR.
          </p>
        ) : null}
        {selectedDoctor ? (
          <p className="muted">
            Schedule <code>{selectedDoctor.schedule_id}</code>
            {selectedDoctor.location_id ? (
              <>
                {" "}
                · campus <code>{selectedDoctor.location_id}</code>
              </>
            ) : null}
          </p>
        ) : null}

        {feedback ? <p className="ok">{feedback}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <div className="board-summary">
          <div className="stat-chip">
            <span className="stat-value">{slots.length}</span>
            <span className="stat-label">Free slots</span>
          </div>
          <div className="stat-chip">
            <span className="stat-value">{formatSlotDate(`${date}T09:00:00`)}</span>
            <span className="stat-label">Selected day</span>
          </div>
        </div>

        {loading ? <p className="muted">Loading schedule…</p> : null}

        {!loading && !error && slots.length === 0 && selectedDoctor ? (
          <p className="muted">
            No free slots on this date. Expand the schedule below to generate bookable slots from
            the doctor&apos;s recurrence rule.
          </p>
        ) : null}

        {!loading && slots.length > 0 ? (
          <div className="schedule-board">
            <BoardColumn title="Morning" slots={morning} />
            <BoardColumn title="Afternoon" slots={afternoon} />
          </div>
        ) : null}
      </section>

      {selectedDoctor ? (
        <section className="card">
          <h2>Generate OPD slots</h2>
          <p className="muted">
            Creates FHIR <code>Slot</code> resources from{" "}
            <code>{selectedDoctor.schedule_id}</code>&apos;s recurrence rule for the date range
            below. Existing slots are skipped.
          </p>
          {canProvisionSchedules ? (
            <div className="board-toolbar">
              <label>
                From
                <input
                  type="date"
                  value={date}
                  min={todayIsoDate()}
                  disabled={expanding}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={expandToDate}
                  min={date}
                  disabled={expanding}
                  onChange={(e) => setExpandToDate(e.target.value)}
                />
              </label>
              <button type="button" disabled={expanding} onClick={() => void onExpandSlots()}>
                {expanding ? "Generating…" : `Generate slots for ${selectedDoctor.name}`}
              </button>
            </div>
          ) : (
            <p className="muted">
              <code>scheduling:provision</code> permission is required to expand schedules.
            </p>
          )}
        </section>
      ) : null}

      {canAdminSchedules ? (
        <section className="card">
          <h2>Add FHIR practitioner</h2>
          <p className="muted">
            Creates an <code>atrius-in-practitioner</code> resource in the FHIR store. Keycloak
            login, realm roles, and clinical app access must still be configured manually for this
            user to sign in.
          </p>
          <form className="admin-form" onSubmit={(event) => void onCreatePractitioner(event)}>
            <div className="board-toolbar">
              <label>
                Practitioner id
                <input
                  value={practitionerIdInput}
                  placeholder="dr-mehta"
                  required
                  disabled={creatingPractitioner}
                  onChange={(e) => setPractitionerIdInput(e.target.value)}
                />
              </label>
              <label>
                Family name
                <input
                  value={familyName}
                  required
                  disabled={creatingPractitioner}
                  onChange={(e) => setFamilyName(e.target.value)}
                />
              </label>
              <label>
                Given name(s)
                <input
                  value={givenName}
                  placeholder="Asha"
                  required
                  disabled={creatingPractitioner}
                  onChange={(e) => setGivenName(e.target.value)}
                />
              </label>
              <label>
                Prefix
                <input
                  value={namePrefix}
                  disabled={creatingPractitioner}
                  onChange={(e) => setNamePrefix(e.target.value)}
                />
              </label>
              <label>
                Gender
                <select
                  value={gender}
                  disabled={creatingPractitioner}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="unknown">unknown</option>
                  <option value="male">male</option>
                  <option value="female">female</option>
                  <option value="other">other</option>
                </select>
              </label>
            </div>
            <button type="submit" disabled={creatingPractitioner}>
              {creatingPractitioner ? "Creating…" : "Create practitioner"}
            </button>
          </form>
        </section>
      ) : null}

      {canProvisionSchedules ? (
        <section className="card">
            <h2>Create OPD schedule</h2>
            <p className="muted">
              Defines a recurring FHIR <code>Schedule</code> for the selected hospital campus. After
              creating it, use Generate OPD slots above to materialize bookable slots.
            </p>
            {practitionersLoading ? <p className="muted">Loading practitioners…</p> : null}
            <form className="admin-form" onSubmit={(event) => void onCreateSchedule(event)}>
              <div className="board-toolbar">
                <label>
                  Practitioner
                  <select
                    value={schedulePractitionerId}
                    disabled={creatingSchedule || practitioners.length === 0}
                    onChange={(e) => setSchedulePractitionerId(e.target.value)}
                  >
                    {practitioners.map((practitioner) => (
                      <option key={practitioner.practitioner_id} value={practitioner.practitioner_id}>
                        {practitioner.name} ({practitioner.practitioner_id})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Schedule id
                  <input
                    value={scheduleIdInput}
                    required
                    disabled={creatingSchedule}
                    onChange={(e) => setScheduleIdInput(e.target.value)}
                  />
                </label>
                <label>
                  Start hour
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={scheduleHour}
                    disabled={creatingSchedule}
                    onChange={(e) => setScheduleHour(Number(e.target.value))}
                  />
                </label>
                <label>
                  Start minute
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={scheduleMinute}
                    disabled={creatingSchedule}
                    onChange={(e) => setScheduleMinute(Number(e.target.value))}
                  />
                </label>
                <label>
                  Horizon from
                  <input
                    type="date"
                    value={horizonStart}
                    disabled={creatingSchedule}
                    onChange={(e) => setHorizonStart(e.target.value)}
                  />
                </label>
                <label>
                  Horizon to
                  <input
                    type="date"
                    value={horizonEnd}
                    min={horizonStart}
                    disabled={creatingSchedule}
                    onChange={(e) => setHorizonEnd(e.target.value)}
                  />
                </label>
              </div>
              <fieldset className="weekday-picker">
                <legend>Weekdays</legend>
                {WEEKDAYS.map((day) => (
                  <label key={day.code} className="weekday-option">
                    <input
                      type="checkbox"
                      checked={weekdays.includes(day.code)}
                      disabled={creatingSchedule}
                      onChange={() => toggleWeekday(day.code)}
                    />
                    {day.label}
                  </label>
                ))}
              </fieldset>
              {selectedHospitalId ? (
                <p className="muted">
                  Campus: <code>{campusForHospital(selectedHospitalId) ?? selectedHospitalId}</code>
                </p>
              ) : null}
              <button
                type="submit"
                disabled={
                  creatingSchedule ||
                  !selectedHospitalId ||
                  !schedulePractitionerId ||
                  weekdays.length === 0
                }
              >
                {creatingSchedule ? "Creating…" : "Create OPD schedule"}
              </button>
            </form>
          </section>
      ) : null}
    </AdminLayout>
  );
}

function BoardColumn({ title, slots }: { title: string; slots: SlotSummary[] }) {
  return (
    <div className="board-column">
      <h3>{title}</h3>
      {slots.length === 0 ? (
        <p className="muted">No free slots</p>
      ) : (
        <ul className="board-slot-list">
          {slots.map((slot) => (
            <li key={slot.slot_id} className="board-slot-card">
              <span className="board-slot-time">{formatSlotTime(slot.start)}</span>
              <span className="board-slot-status">Available</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
