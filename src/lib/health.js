// Rules-based system health assessment. Deliberately NOT a 0-100 score —
// a number implies calibration we don't have data to back yet. Every
// conclusion here is a plain-language reason you can inspect and dispute.
// Tune the thresholds below as you learn what actually predicts trouble;
// they start as reasonable guesses, not a trained model.

const businessDaysLate = (dueDateStr) => {
  if (!dueDateStr) return 0;
  const due = new Date(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  if (due >= today) return 0;
  let days = 0;
  const cursor = new Date(due);
  while (cursor < today) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days++;
  }
  return days;
};

export function assessProjectHealth({ milestones = [], dependencies = [], risks = [], changeRequests = [] }) {
  const reasons = [];
  let hardFlags = 0;
  let worstOverdueDays = 0;

  for (const m of milestones) {
    if (m.status === "Done") continue;
    const late = businessDaysLate(m.dueDate);
    if (late <= 0) continue;
    worstOverdueDays = Math.max(worstOverdueDays, late);
    if (m.isCritical && late > 5) {
      reasons.push(`Critical milestone "${m.name}" is ${late} business days overdue`);
      hardFlags++;
    } else if (!m.isCritical && late > 10) {
      reasons.push(`Milestone "${m.name}" is ${late} business days overdue`);
    }
  }

  for (const d of dependencies) {
    if (d.status === "Received") continue;
    const late = businessDaysLate(d.dueDate);
    if (late <= 0) continue;
    if (d.isBlocking) {
      reasons.push(`Blocking dependency "${d.name}" is ${late} business days past due`);
      hardFlags++;
      worstOverdueDays = Math.max(worstOverdueDays, late);
    } else {
      reasons.push(`Dependency "${d.name}" is ${late} business days past due`);
    }
  }

  for (const r of risks) {
    if (r.status !== "Open") continue;
    if (r.impact === "High" && !r.mitigation?.trim()) {
      reasons.push(`High-impact risk has no mitigation on file: "${r.description}"`);
      hardFlags++;
    }
  }

  const openChangeWeeks = changeRequests
    .filter((c) => c.status !== "Rejected")
    .reduce((sum, c) => sum + (Number(c.impactWeeks) || 0), 0);
  if (openChangeWeeks > 2) {
    reasons.push(`Open/approved change requests add ${openChangeWeeks} weeks of scope not yet reflected in the plan`);
  }

  let assessment = "Green";
  if (hardFlags >= 2 || worstOverdueDays > 15) assessment = "Red";
  else if (hardFlags >= 1 || reasons.length > 0) assessment = "Amber";

  return { assessment, reasons };
}
