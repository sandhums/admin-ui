const STORAGE_KEY = "atrius-admin-opd-workflow";

export type OpdWorkflowResume = {
  patientId: string;
  mrn?: string;
  givenName?: string;
  familyName?: string;
  appointmentDate: string;
  practitionerId: string;
};

export function readOpdWorkflowResume(): OpdWorkflowResume | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpdWorkflowResume;
    if (!parsed.patientId || !parsed.appointmentDate || !parsed.practitionerId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeOpdWorkflowResume(resume: OpdWorkflowResume): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(resume));
}

export function clearOpdWorkflowResume(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
