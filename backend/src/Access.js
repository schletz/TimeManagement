/**
 * Shared permission rules for entries that belong to an employee (time entries, purchases, photos).
 */
const Access = {
  /**
   * Determines the employee an entry is recorded for. Employees always record for themselves,
   * the chef may choose any employee (default: himself).
   * @param {Object} ctx
   * @param {string} [requestedId]
   * @returns {{id: string, name: string, hourlyRate: number}}
   */
  targetEmployee(ctx, requestedId) {
    const id = ctx.isChef ? (Util.text(requestedId) || ctx.user.employeeId) : ctx.user.employeeId;
    const employee = id ? MasterData.employeeById(id) : null;
    assertValid(employee, ctx.isChef ? 'Bitte einen Mitarbeiter wählen.' : 'Kein Mitarbeiter-Eintrag vorhanden.');
    return employee;
  },

  /**
   * Checks that an existing entry may be changed: only open entries; employees only their own.
   * Project status is checked separately via Projects.requireAccess.
   * @param {Object} ctx
   * @param {{status: string}} row
   * @param {string} ownerId employee id of the entry
   */
  assertEditable(ctx, row, ownerId) {
    if (!ctx.isChef && ownerId !== ctx.user.employeeId) {
      throw new AppError('FORBIDDEN', 'Nur eigene Einträge können geändert werden.');
    }
    if (row.status && row.status !== 'open') {
      throw new AppError('CONFLICT', 'Der Eintrag ist bereits verrechnet und kann nicht mehr geändert werden.');
    }
  },

  /**
   * Checks that the user may modify an entry that has no billing status (photos).
   * @param {Object} ctx
   * @param {string} ownerId
   */
  assertOwner(ctx, ownerId) {
    if (!ctx.isChef && ownerId !== ctx.user.employeeId) {
      throw new AppError('FORBIDDEN', 'Nur eigene Einträge können geändert werden.');
    }
  },
};
