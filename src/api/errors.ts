export type BffErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  duplicates?: DuplicateMatch[];
  step_up_url?: string;
};

export type DuplicateMatch = {
  patient_id: string;
  mrn?: string;
  name?: string;
  birth_date?: string;
  match_reason: string;
};

export class BffError extends Error {
  status: number;
  body: BffErrorBody;

  constructor(status: number, body: BffErrorBody) {
    super(body.message ?? body.error ?? `${status}`);
    this.name = "BffError";
    this.status = status;
    this.body = body;
  }

  get isDuplicatePatient() {
    return this.status === 409 && this.body.error === "duplicate_patient";
  }

  get isInvalidRequest() {
    return this.status === 400 && this.body.error === "invalid_request";
  }

  get isStepUpRequired() {
    return this.status === 403 && this.body.code === "step_up_required";
  }
}
