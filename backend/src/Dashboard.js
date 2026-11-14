/**
 * Chef dashboard, computed live from the project spreadsheets.
 */
const Dashboard = {
  /**
   * getDashboard (chef).
   * @param {Object} ctx
   * @param {{includeClosed?: boolean}} p
   * @returns {{projects: Object[], openDemands: Object[], openReimbursements: Object[]}}
   */
  get(ctx, p) {
    const projects = [];
    const openDemands = [];
    const reimbursements = {};
    Projects.all()
      .filter((pr) => (p && p.includeClosed) || pr.status === 'active')
      .forEach((project) => {
        const ss = Projects.spreadsheet(project);
        const times = Table.read(ss, 'timeEntries');
        const purchases = Table.read(ss, 'purchases');
        const perEmployee = {};
        times.forEach((t) => {
          const e = perEmployee[t.employeeId] || { employeeId: t.employeeId, employeeName: t.employeeName, hours: 0, openHours: 0 };
          e.hours += t.hours || 0;
          if (t.status === 'open') e.openHours += t.hours || 0;
          perEmployee[t.employeeId] = e;
        });
        projects.push({
          id: project.id,
          name: project.name,
          client: project.client,
          status: project.status,
          hours: this.byStatus(times, (t) => t.hours || 0),
          material: this.byStatus(purchases, (x) => x.amount || 0),
          hoursPerEmployee: Object.keys(perEmployee).map((k) => perEmployee[k])
            .sort((a, b) => b.hours - a.hours),
        });

        Table.read(ss, 'demands').filter((d) => d.status !== 'done').forEach((d) => {
          openDemands.push(Object.assign(Demands.dto(d), { projectId: project.id, projectName: project.name }));
        });

        purchases.filter((x) => !x.reimbursed).forEach((x) => {
          const r = reimbursements[x.buyerId] || { employeeId: x.buyerId, employeeName: x.buyerName, count: 0, amount: 0 };
          r.count += 1;
          r.amount = Util.round2(r.amount + (x.amount || 0));
          reimbursements[x.buyerId] = r;
        });
      });

    // Urgent first, then open before ordered, then oldest first.
    const statusOrder = { open: 0, ordered: 1 };
    openDemands.sort((a, b) => (a.urgency === 'urgent' ? 0 : 1) - (b.urgency === 'urgent' ? 0 : 1)
      || statusOrder[a.status] - statusOrder[b.status] || a.date.localeCompare(b.date));

    return {
      projects: projects.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      openDemands,
      openReimbursements: Object.keys(reimbursements).map((k) => reimbursements[k])
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'de')),
    };
  },

  /**
   * Sums a value per billing status.
   * @private
   * @returns {{total: number, open: number, invoiced: number, paid: number}}
   */
  byStatus(rows, value) {
    const sums = { total: 0, open: 0, invoiced: 0, paid: 0 };
    rows.forEach((r) => {
      const v = value(r);
      sums.total += v;
      if (r.status in sums) sums[r.status] += v;
    });
    Object.keys(sums).forEach((k) => { sums[k] = Util.round2(sums[k]); });
    return sums;
  },
};
