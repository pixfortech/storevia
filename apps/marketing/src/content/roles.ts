// Every standard team role in one line each, for the public site. Labels come
// from the RBAC definitions the server enforces, and descriptions from the
// business-type role presets (ADR-0024), so the site describes the roles the
// product actually has. A test checks every role appears exactly once.
import { BUSINESS_TYPE_DEFINITIONS, BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { MEMBER_ROLES, ROLE_LABELS, type MemberRole } from "@storevia/tenancy/rbac";

export interface RoleSummary {
  readonly role: MemberRole;
  readonly label: string;
  readonly description: string;
}

// The owner isn't a preset (ownership only moves by transfer).
const OWNER = "Everything, including billing and handing over ownership.";

function presetDescriptions(): ReadonlyMap<MemberRole, string> {
  const found = new Map<MemberRole, string>();
  for (const type of BUSINESS_TYPES) {
    for (const preset of BUSINESS_TYPE_DEFINITIONS[type].rolePresets) {
      if (!found.has(preset.role)) found.set(preset.role, preset.description);
    }
  }
  return found;
}

/** Every role, in the RBAC order, with a one-line description. */
export function roleSummaries(): RoleSummary[] {
  const descriptions = presetDescriptions();
  return MEMBER_ROLES.flatMap((role) => {
    const description = role === "OWNER" ? OWNER : descriptions.get(role);
    return description ? [{ role, label: ROLE_LABELS[role], description }] : [];
  });
}
