// One-off script: seeds a real staff member + login for each of the 8 default institute roles
// into sample-data/pi-merit-demo-100.json, so the RBAC feature can be demoed/logged into directly
// without going through the User Memberships UI first. Run with: node scripts/seed-staff-logins.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_INSTITUTE_ROLES } from "../js/admission-engine.js";

const FILE = new URL("../sample-data/pi-merit-demo-100.json", import.meta.url);
const d = JSON.parse(readFileSync(FILE, "utf8"));
const instituteId = d.institutes[0].id; // "SIM"

// Same id scheme seedDefaultRoles uses in admission-engine.js — keeping it explicit here (rather
// than relying on normalizeDataset's backfill) so this demo file is self-contained and never
// silently drifts if DEFAULT_INSTITUTE_ROLES' shape changes later.
d.roles = DEFAULT_INSTITUTE_ROLES.map((r, i) => ({
  id: `ROLE-${instituteId}-${i + 1}`, instituteId, name: r.name, pages: [...r.pages], isDefault: true
}));

const PEOPLE = [
  { role: "Director", name: "Vikram Rao", email: "director@sim.edu.in", password: "Director@123" },
  { role: "Registrar", name: "Meena Iyer", email: "registrar@sim.edu.in", password: "Registrar@123" },
  { role: "Admission Officer", name: "Arjun Nair", email: "admissionofficer@sim.edu.in", password: "AdmissionOfficer@123" },
  { role: "Coordinator", name: "Sneha Kapoor", email: "coordinator@sim.edu.in", password: "Coordinator@123" },
  { role: "Panelist", name: "Rohit Bhatia", email: "panelist.staff@sim.edu.in", password: "PanelistStaff@123" },
  { role: "Observer", name: "Kavya Menon", email: "observer@sim.edu.in", password: "Observer@123" },
  { role: "Document Verification Team", name: "Anjali Desai", email: "docverification@sim.edu.in", password: "DocVerification@123" },
  { role: "SIU", name: "Suresh Pillai", email: "siu@sim.edu.in", password: "Siu@123" }
];

d.staff = PEOPLE.map((p, i) => {
  const role = d.roles.find((r) => r.name === p.role);
  return {
    id: `STAFF-${instituteId}-${i + 1}`, instituteId, name: p.name, email: p.email, mobile: "",
    roleId: role.id, status: "Active",
    credentials: { loginId: p.email, password: p.password, issuedOn: "2026-09-08" }
  };
});

writeFileSync(FILE, JSON.stringify(d, null, 2) + "\n");
console.log(`Seeded ${d.roles.length} roles + ${d.staff.length} staff logins for institute "${instituteId}".`);
