import { bffFetch } from "./bff";

export type AdminPermissionSummary = {
  permission_id: string;
  code: string;
  description: string;
};

export type AdminHospitalSummary = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
};

export type AdminRoleSummary = {
  role_id: string;
  code: string;
  name: string;
  description?: string;
  persona?: string;
  permissions: string[];
};

export type AdminUserRoleAssignment = {
  code: string;
  hospital_id?: string;
};

export type AdminUserSummary = {
  user_id: string;
  email?: string;
  display_name?: string;
  fhir_user?: string;
  roles: AdminUserRoleAssignment[];
  permissions: string[];
};

export type ListUsersResponse = {
  count: number;
  users: AdminUserSummary[];
};

export type ListRolesResponse = {
  count: number;
  roles: AdminRoleSummary[];
};

export type ListHospitalsResponse = {
  count: number;
  hospitals: AdminHospitalSummary[];
};

export type ListPermissionsResponse = {
  count: number;
  permissions: AdminPermissionSummary[];
};

export async function listAuthzUsers(): Promise<ListUsersResponse> {
  return bffFetch("/bff/authz/users");
}

export async function listAuthzRoles(): Promise<ListRolesResponse> {
  return bffFetch("/bff/authz/roles");
}

export async function listAuthzHospitals(): Promise<ListHospitalsResponse> {
  return bffFetch("/bff/authz/hospitals");
}

export async function listAuthzPermissions(): Promise<ListPermissionsResponse> {
  return bffFetch("/bff/authz/permissions");
}

export async function getAuthzUser(
  userId: string,
  options?: { hospitalId?: string | null },
): Promise<AdminUserSummary> {
  const qs = new URLSearchParams();
  if (options?.hospitalId) {
    qs.set("hospital_id", options.hospitalId);
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return bffFetch(`/bff/authz/users/${userId}${suffix}`);
}

export async function setAuthzUserRoles(
  userId: string,
  roleCodes: string[],
  options?: { hospitalId?: string | null },
): Promise<{ user: AdminUserSummary; message: string }> {
  const body: { role_codes: string[]; hospital_id?: string } = {
    role_codes: roleCodes,
  };
  if (options?.hospitalId) {
    body.hospital_id = options.hospitalId;
  }
  return bffFetch(`/bff/authz/users/${userId}/roles`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function setAuthzRolePermissions(
  roleId: string,
  permissionCodes: string[],
): Promise<{ role: AdminRoleSummary; message: string }> {
  return bffFetch(`/bff/authz/roles/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permission_codes: permissionCodes }),
  });
}
