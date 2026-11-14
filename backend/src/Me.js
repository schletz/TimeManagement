/**
 * Session information for the frontend (action `me`).
 */
const Me = {
  /**
   * Role, own employee record and – for the chef – the employee list for selection fields.
   * @param {Object} ctx
   * @returns {Object}
   */
  get(ctx) {
    const u = ctx.user;
    const result = {
      email: u.email,
      role: u.role,
      employee: u.employeeId ? { id: u.employeeId, name: u.name, shortName: u.shortName } : null,
    };
    if (ctx.isChef) {
      result.employees = MasterData.employees().map((e) => ({ id: e.id, name: e.name, shortName: e.shortName, active: e.active }));
    }
    return result;
  },
};
