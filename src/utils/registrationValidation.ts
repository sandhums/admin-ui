import type { RegisterPatientRequest, RegistrationChoicesResponse } from "../api/his";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_REGISTRATION_CHOICES: RegistrationChoicesResponse = {
  gender: [
    { code: "female", display: "Female" },
    { code: "male", display: "Male" },
    { code: "other", display: "Other" },
    { code: "unknown", display: "Unknown" },
  ],
  telecom_system: [
    { code: "phone", display: "Phone" },
    { code: "email", display: "Email" },
  ],
  telecom_use: [
    { code: "mobile", display: "Mobile" },
    { code: "home", display: "Home" },
    { code: "work", display: "Work" },
  ],
  address_use: [
    { code: "home", display: "Home" },
    { code: "work", display: "Work" },
  ],
};

export type RegistrationFormValues = {
  familyName: string;
  givenName: string;
  gender: string;
  birthDate: string;
  phoneValue: string;
  telecomSystem: string;
  telecomUse: string;
  includeAddress: boolean;
  addressUse: string;
  addressLine: string;
  addressCity: string;
  addressState: string;
  addressPostal: string;
  addressCountry: string;
};

export function buildRegisterRequest(
  values: RegistrationFormValues,
  allowDuplicates: boolean,
): RegisterPatientRequest {
  const req: RegisterPatientRequest = {
    family_name: values.familyName.trim(),
    given_names: [values.givenName.trim()],
    gender: values.gender,
    birth_date: values.birthDate,
    allow_duplicates: allowDuplicates,
  };

  if (values.phoneValue.trim()) {
    req.telecom = [
      {
        system: values.telecomSystem,
        value: values.phoneValue.trim(),
        use_: values.telecomUse,
      },
    ];
  }

  if (values.includeAddress && values.addressLine.trim()) {
    req.address = [
      {
        use_: values.addressUse,
        line: [values.addressLine.trim()],
        city: values.addressCity.trim() || undefined,
        state: values.addressState.trim() || undefined,
        postal_code: values.addressPostal.trim() || undefined,
        country: values.addressCountry.trim() || undefined,
      },
    ];
  }

  return req;
}

export function validateRegistrationForm(
  values: RegistrationFormValues,
  choices: RegistrationChoicesResponse,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.familyName.trim()) {
    errors.familyName = "Family name is required";
  }
  if (!values.givenName.trim()) {
    errors.givenName = "Given name is required";
  }
  if (!values.birthDate.trim()) {
    errors.birthDate = "Birth date is required";
  } else if (!ISO_DATE.test(values.birthDate)) {
    errors.birthDate = "Birth date must be YYYY-MM-DD";
  }
  if (!choices.gender.some((g) => g.code === values.gender)) {
    errors.gender = "Select a valid gender";
  }
  if (values.phoneValue.trim()) {
    if (!choices.telecom_system.some((c) => c.code === values.telecomSystem)) {
      errors.telecomSystem = "Invalid contact system";
    }
    if (!choices.telecom_use.some((c) => c.code === values.telecomUse)) {
      errors.telecomUse = "Invalid contact use";
    }
  }
  if (values.includeAddress) {
    if (!values.addressLine.trim()) {
      errors.addressLine = "Address line is required when address is included";
    }
    if (!choices.address_use.some((c) => c.code === values.addressUse)) {
      errors.addressUse = "Invalid address use";
    }
  }

  return errors;
}

export function isAllowedCode(options: { code: string }[], code: string): boolean {
  return options.some((o) => o.code === code);
}
