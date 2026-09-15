// One-off generator for tomorrow's Symbiosis Law School presentation demo data.
// Builds 4 institutes, 9 programmes, 1000 candidates (real Indian names), 7 staff roles
// (1 member each, per institute), all logins on password "admin@123".
// Run with: node scripts/generate-symbiosis-mock.mjs
import { writeFileSync } from "node:fs";
import { DEFAULT_INSTITUTE_ROLES, DEFAULT_REQUIRED_DOCUMENTS, buildCandidateDocuments, verificationComplete } from "../js/admission-engine.js";

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260916);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randInt = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
};

const MALE_FIRST = ["Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Reyansh","Krishna","Ishaan","Rohan","Kabir","Aryan","Dev","Karan","Yash","Siddharth","Rahul","Nikhil","Varun","Abhishek","Rajat","Amit","Gaurav","Vikram","Anand","Harsh","Manish","Pranav","Sameer","Tarun","Ankit","Ayush","Dhruv","Kunal","Naman","Om","Parth","Raghav","Shaurya","Vedant","Akash","Chirag","Deepak","Girish","Imran","Jatin","Lakshya","Mohit","Nitin","Ojas","Pratik","Rishabh","Sahil","Tanay","Utkarsh","Vishal","Zaid","Adil","Balram","Chetan"];
const FEMALE_FIRST = ["Aadhya","Saanvi","Ananya","Diya","Ira","Myra","Pari","Anika","Navya","Kiara","Riya","Sneha","Priya","Neha","Pooja","Kavya","Meera","Isha","Tanvi","Shreya","Nandini","Aditi","Divya","Ritika","Simran","Vidya","Anjali","Bhavya","Charu","Deepika","Esha","Falguni","Gauri","Harshita","Ishita","Jhanvi","Komal","Lavanya","Manasvi","Nikita","Oorja","Palak","Radhika","Sanya","Trisha","Urvi","Vaishnavi","Yamini","Zoya","Amrita","Bhumika","Chaitali","Devika","Ekta","Farah","Garima","Hiral","Indira","Jaya"];
const SURNAMES = ["Sharma","Verma","Gupta","Mehta","Shah","Patel","Desai","Joshi","Kulkarni","Deshpande","Kelkar","Chavan","Pawar","Jadhav","Gaikwad","Bhosale","Rao","Reddy","Naidu","Iyer","Iyengar","Nair","Menon","Pillai","Krishnan","Subramaniam","Banerjee","Chatterjee","Mukherjee","Bose","Sengupta","Dutta","Ghosh","Roy","Chakraborty","Singh","Kaur","Chauhan","Rathore","Rana","Bhatt","Trivedi","Pandey","Mishra","Tiwari","Dubey","Saxena","Agarwal","Bansal","Jain","Malhotra","Khanna","Kapoor","Chopra","Arora","Anand","Bhatia","Sethi","Ahluwalia","Grewal","Yadav","Choudhary","Prasad","Thakur","Rawat","Bhatnagar","Sinha","Ranjan","Kumar","Suresh","Ramesh","Krishnamurthy","Venkatesh","Raman","Balan","Warrier","Kamath","Shenoy","Hegde","Bhagat"];
const EDUCATION = ["Science", "Commerce", "Arts", "Humanities"];

let nameSeq = 0;
function makeCandidateName() {
  nameSeq++;
  const gender = rnd() < 0.52 ? "Male" : "Female";
  const first = pick(gender === "Male" ? MALE_FIRST : FEMALE_FIRST);
  const last = pick(SURNAMES);
  return { name: `${first} ${last}`, gender };
}

const STAFF_ROLE_TEMPLATE = DEFAULT_INSTITUTE_ROLES.filter((r) => r.name !== "SIU");
const STAFF_PEOPLE_BASE = [
  { role: "Director", name: "Vikram Rao" },
  { role: "Registrar", name: "Meena Iyer" },
  { role: "Admission Officer", name: "Arjun Nair" },
  { role: "Coordinator", name: "Sneha Kapoor" },
  { role: "Panelist", name: "Rohit Bhatia" },
  { role: "Observer", name: "Kavya Menon" },
  { role: "Document Verification Team", name: "Anjali Desai" }
];

const INSTITUTES = [
  {
    id: "SLSPUN", name: "Symbiosis Law School, Pune", code: "SLSPUN", city: "Pune",
    adminEmail: "admin@slspune.edu.in", staffDomain: "slspune.edu.in",
    programmes: [
      { id: "BALLBHPUN", name: "B.A. LL.B (Honours) – Symbiosis Law School, Pune", code: "BALLBHPUN" },
      { id: "BBALLBHPUN", name: "B.B.A. LL.B (Honours) – Symbiosis Law School, Pune", code: "BBALLBHPUN" },
      { id: "BCOMLLBHPUN", name: "B.Com. LL.B. (Honours) – Symbiosis Law School, Pune", code: "BCOMLLBHPUN" }
    ]
  },
  {
    id: "SLSNOI", name: "Symbiosis Law School, Noida", code: "SLSNOI", city: "Noida",
    adminEmail: "admin@slsnoida.edu.in", staffDomain: "slsnoida.edu.in",
    programmes: [
      { id: "BALLBNOI", name: "B.A. LL.B. – Symbiosis Law School, Noida", code: "BALLBNOI" },
      { id: "BBALLBNOI", name: "B.B.A. LL.B. – Symbiosis Law School, Noida", code: "BBALLBNOI" }
    ]
  },
  {
    id: "SLSHYD", name: "Symbiosis Law School, Hyderabad", code: "SLSHYD", city: "Hyderabad",
    adminEmail: "admin@slshyderabad.edu.in", staffDomain: "slshyderabad.edu.in",
    programmes: [
      { id: "BALLBHYD", name: "B.A. LL.B. – Symbiosis Law School, Hyderabad", code: "BALLBHYD" },
      { id: "BBALLBHYD", name: "B.B.A. LL.B. – Symbiosis Law School, Hyderabad", code: "BBALLBHYD" }
    ]
  },
  {
    id: "SLSNAG", name: "Symbiosis Law School, Nagpur", code: "SLSNAG", city: "Nagpur",
    adminEmail: "admin@slsnagpur.edu.in", staffDomain: "slsnagpur.edu.in",
    programmes: [
      { id: "BALLBNAG", name: "B.A. LL.B. – Symbiosis Law School, Nagpur", code: "BALLBNAG" },
      { id: "BBALLBNAG", name: "B.B.A. LL.B. – Symbiosis Law School, Nagpur", code: "BBALLBNAG" }
    ]
  }
];

const PASSWORD = "admin@123";
const ISSUED_ON = "2026-09-15";

const ds = {
  institutes: [], programmes: [], academicYears: [], activeAcademicYearByProgramme: {},
  activeProgrammeId: null, roles: [], staff: [], admissionCycles: [], activeCycleByProgYear: {},
  candidates: []
};

// 9 programmes, 1000 candidates total — 112 to the first, 111 to the rest.
const allProgrammeIds = INSTITUTES.flatMap((i) => i.programmes.map((p) => p.id));
const candidateCounts = Object.fromEntries(
  allProgrammeIds.map((id, i) => [id, i === 0 ? 112 : 111])
);

INSTITUTES.forEach((inst, instIdx) => {
  ds.institutes.push({
    id: inst.id, name: inst.name, code: inst.code, adminName: "Institute Admin", adminEmail: inst.adminEmail,
    adminMobile: `98${randInt(10000000, 99999999)}`, status: "Active",
    credentials: { password: PASSWORD, issuedOn: ISSUED_ON }
  });

  const instRoles = STAFF_ROLE_TEMPLATE.map((r, i) => ({
    id: `ROLE-${inst.id}-${i + 1}`, instituteId: inst.id, name: r.name, pages: [...r.pages], isDefault: true
  }));
  ds.roles.push(...instRoles);

  ds.staff.push(...STAFF_PEOPLE_BASE.map((p, i) => {
    const role = instRoles.find((r) => r.name === p.role);
    const loginId = `${p.role.toLowerCase().replace(/[^a-z]+/g, ".")}@${inst.staffDomain}`;
    return {
      id: `STAFF-${inst.id}-${i + 1}`, instituteId: inst.id, name: p.name, email: loginId, mobile: `98${randInt(10000000, 99999999)}`,
      roleId: role.id, status: "Active",
      credentials: { loginId, password: PASSWORD, issuedOn: ISSUED_ON }
    };
  }));

  const directorRoleId = instRoles.find((r) => r.name === "Director").id;
  inst.programmes.forEach((prog) => {
    ds.programmes.push({
      id: prog.id, instituteId: inst.id, name: prog.name, code: prog.code, description: "", status: "Active",
      city: inst.city, centre: inst.city,
      // Explicit single-level chain (Director only), instead of leaving this to normalizeDataset's
      // DEFAULT_APPROVAL_CHAIN fallback — that default's second level is "SIU", a role this demo
      // deliberately doesn't seed (see STAFF_ROLE_TEMPLATE), so it would resolve to roleId: null and
      // permanently dead-end any shortlist/merit/assessment-params approval that reaches it.
      approvalChain: [{ id: `AC-${prog.id}-1`, seq: 1, roleId: directorRoleId }]
    });
    const ayId = `AY2026-${prog.id}`;
    ds.academicYears.push({ id: ayId, programmeId: prog.id, label: "2026–27", status: "Active" });
    ds.activeAcademicYearByProgramme[prog.id] = ayId;
    if (instIdx === 0 && prog === inst.programmes[0]) ds.activeProgrammeId = prog.id;

    const cycleId = `CYC-${prog.id}-${ayId}-1`;
    ds.admissionCycles.push({ id: cycleId, programmeId: prog.id, academicYearId: ayId, name: "Round 1", status: "Active", createdOn: ISSUED_ON });
    ds.activeCycleByProgYear[`${prog.id}::${ayId}`] = cycleId;

    const total = candidateCounts[prog.id];
    for (let n = 1; n <= total; n++) {
      const id = `${prog.id}-${String(n).padStart(4, "0")}`;
      const { name, gender } = makeCandidateName();
      const category = weighted([["OPEN", 50], ["SC", 15], ["ST", 10], ["DA", 10], ["KM", 15]]);
      // Mirrors commitImportJob in js/import-engine.js exactly, so these candidates sit at the same
      // just-imported stage a real CSV import would leave them at, ready for the institute to shortlist
      // themselves instead of having a pre-decided status baked in.
      const documents = buildCandidateDocuments(id, category, DEFAULT_REQUIRED_DOCUMENTS);
      const shortlistStatus = verificationComplete({ category, verification: { documents } }, DEFAULT_REQUIRED_DOCUMENTS) ? "doc-verified" : "draft";
      ds.candidates.push({
        id, programmeId: prog.id, academicYearId: ayId, cycleId, category,
        name, gender, educationBackground: pick(EDUCATION),
        tenthPct: randInt(55, 98), twelfthPct: randInt(55, 98),
        slatScore: randInt(40, 100), slatPercentile: randInt(10, 99),
        shortlistStatus, shortlistId: null,
        allocation: null, piId: null,
        registrationAttendance: "pending", piAttendance: "pending",
        piScores: {}, piNotes: {}, piScoreLocked: {}, piTotal: null, apvScore: null,
        verification: { documents },
        outcome: null, finalScore: null, meritCategory: null, meritBatchId: null, rank: null, waitingListNumber: null,
        meritApproval: [], meritListReleaseId: null,
        timeline: [{ label: "Imported", date: ISSUED_ON }],
        importLineage: null
      });
    }
  });
});

ds.activeProgrammeId = ds.programmes[0].id;

const outPath = new URL("../sample-data/mocup_Demo_symb.json", import.meta.url);
writeFileSync(outPath, JSON.stringify(ds, null, 2) + "\n");
console.log(`Wrote ${ds.institutes.length} institutes, ${ds.programmes.length} programmes, ${ds.staff.length} staff, ${ds.candidates.length} candidates.`);
