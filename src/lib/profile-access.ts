export type ProfileAccessMode = "staff" | "customer" | "restricted";

export type ProfileAccessIdentity = {
  isStaff: boolean;
  roles: readonly string[];
};

/**
 * Keep profile navigation aligned with the explicit role gates used by the
 * customer workspaces. Unknown/non-customer roles must not inherit customer
 * profile queries or shortcuts merely because they are not staff roles.
 */
export function resolveProfileAccessMode(user: ProfileAccessIdentity): ProfileAccessMode {
  if (user.isStaff) return "staff";
  if (user.roles.includes("customer")) return "customer";
  return "restricted";
}
