// Check database infrastructure permissions,
// not the website's user/admin roles.
export function assertApplicationRoles(authInfo, dbName) {
  const roles = authInfo?.authenticatedUserRoles;

  // allowed is true if the connection has exactly one role, readWrite, on the configured database.
  const allowed =
    Array.isArray(roles) &&
    roles.length === 1 &&
    roles[0].role === "readWrite" &&
    roles[0].db === dbName;

  // If the connection has any other roles, throw an error to prevent excessive privileges.
  if (!allowed) {
    const error = new Error(
      "Application database privileges are not restricted.",
    );

    error.code = "EXCESS_DATABASE_PRIVILEGES";
    throw error;
  }
}
