"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../app-shell";
import { Panel, PrimaryButton } from "../dashboard-ui";
import { api, refreshCsrf } from "@/lib/api";
type ResultType = "GPA" | "PERCENTAGE";
type EnglishTestType = "IELTS" | "PTE" | "DUOLINGO" | "NONE";
export type StudentProfileUpdate = {
  phone?: string;
  dateOfBirth?: string;
  addressLine?: string;
  city?: string;
  province?: string;
  country: string;
  highestQualification?: string;
  institutionName?: string;
  completionYear?: number;
  resultType?: ResultType;
  resultValue?: number;
  englishTestType: EnglishTestType;
  englishTestScore?: number;
  preferredCountry?: string;
  preferredStudyLevel?: string;
  intendedIntake?: string;
  previousVisaRefusal?: boolean;
  refusalExplanation?: string;
};
type Profile = Partial<Record<"_id" | "userId" | "createdAt" | "updatedAt", string>>
  & Omit<StudentProfileUpdate, "completionYear" | "resultValue" | "englishTestScore">
  & { completionYear?: number | string; resultValue?: number | string; englishTestScore?: number | string };

const optionalText = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined;
const optionalNumber = (value: unknown) => value === "" || value === undefined ? undefined : Number(value);

export function buildStudentProfileUpdate(profile: Profile): StudentProfileUpdate {
  return {
    phone: optionalText(profile.phone),
    dateOfBirth: optionalText(profile.dateOfBirth),
    addressLine: optionalText(profile.addressLine),
    city: optionalText(profile.city),
    province: optionalText(profile.province),
    country: optionalText(profile.country) ?? "Nepal",
    highestQualification: optionalText(profile.highestQualification),
    institutionName: optionalText(profile.institutionName),
    completionYear: optionalNumber(profile.completionYear),
    resultType: optionalText(profile.resultType) as ResultType | undefined,
    resultValue: optionalNumber(profile.resultValue),
    englishTestType: (optionalText(profile.englishTestType) as EnglishTestType | undefined) ?? "NONE",
    englishTestScore: optionalNumber(profile.englishTestScore),
    preferredCountry: optionalText(profile.preferredCountry),
    preferredStudyLevel: optionalText(profile.preferredStudyLevel),
    intendedIntake: optionalText(profile.intendedIntake),
    previousVisaRefusal: profile.previousVisaRefusal,
    refusalExplanation: profile.previousVisaRefusal ? optionalText(profile.refusalExplanation) : undefined,
  };
}

const editableFields = new Set<keyof StudentProfileUpdate>([
  "phone", "dateOfBirth", "addressLine", "city", "province", "country",
  "highestQualification", "institutionName", "completionYear", "resultType", "resultValue",
  "englishTestType", "englishTestScore", "preferredCountry", "preferredStudyLevel",
  "intendedIntake", "previousVisaRefusal", "refusalExplanation",
]);

function profileSaveError(reason: unknown) {
  if (!(reason instanceof Error)) return "Profile could not be saved.";
  const apiError = reason as Error & {
    code?: string;
    details?: { fieldErrors?: Record<string, string[] | undefined> };
  };
  if (apiError.code === "VALIDATION_ERROR") {
    const fieldError = Object.entries(apiError.details?.fieldErrors ?? {})
      .find(([field, messages]) => editableFields.has(field as keyof StudentProfileUpdate) && messages?.[0]);
    if (fieldError) {
      const label = fieldError[0].replace(/([A-Z])/g, " $1").toLowerCase();
      return `${label[0]!.toUpperCase()}${label.slice(1)}: ${fieldError[1]![0]}`;
    }
    return "Please review the profile values and try again.";
  }
  return apiError.message || "Profile could not be saved.";
}
const fieldClass = "min-h-11 rounded-[10px] border border-[var(--border)] bg-white px-3 py-2";
function Field({ label, name, type = "text", value, onChange, ...props }: { label: string; name: string; type?: string; value: string | number; onChange: (name: string, value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type" | "value" | "onChange">) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<input {...props} name={name} type={type} value={value} onChange={(event) => onChange(name, event.target.value)} className={fieldClass} /></label>;
}
export function StudentProfileForm() {
  const [profile, setProfile] = useState<Profile>({ country: "Nepal", englishTestType: "NONE" }); const [completion, setCompletion] = useState(0); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  useEffect(() => { void api<{ profile: Profile | null; completion: number }>("/api/v1/crm/profile").then((result) => { setProfile(result.profile ?? { country: "Nepal", englishTestType: "NONE" }); setCompletion(result.completion); }).catch((reason: Error) => setError(reason.message)); }, []);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  function change(name: string, value: string) { setProfile((current) => ({ ...current, [name]: value })); setDirty(true); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setMessage(""); try { await refreshCsrf(); const payload = buildStudentProfileUpdate(profile); const result = await api<{ profile: Profile; completion: number }>("/api/v1/crm/profile", { method: "PUT", body: JSON.stringify(payload) }); setProfile(result.profile); setCompletion(result.completion); setDirty(false); setMessage("Profile saved successfully."); } catch (reason) { setError(profileSaveError(reason)); } finally { setBusy(false); } }
  return <AppShell role="STUDENT" title="My profile" subtitle="Keep your education and study preferences accurate."><form onSubmit={submit} className="grid gap-6"><div className="app-card flex items-center justify-between p-4"><div><p className="text-sm font-semibold">Profile completion</p><p className="text-2xl font-bold text-[var(--navy)]">{completion}%</p></div><PrimaryButton disabled={busy || !dirty}>{busy ? "Saving…" : "Save profile"}</PrimaryButton></div>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}{message && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}<Panel title="Personal information"><div className="grid gap-4 md:grid-cols-2"><Field label="Phone number" name="phone" value={String(profile.phone ?? "")} onChange={change} /><Field label="Date of birth" name="dateOfBirth" type="date" value={profile.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : ""} onChange={change} /><Field label="Address line" name="addressLine" value={String(profile.addressLine ?? "")} onChange={change} /><Field label="City" name="city" value={String(profile.city ?? "")} onChange={change} /><Field label="Province" name="province" value={String(profile.province ?? "")} onChange={change} /><Field label="Country" name="country" value={String(profile.country ?? "Nepal")} onChange={change} /></div></Panel><Panel title="Academic information"><div className="grid gap-4 md:grid-cols-2"><Field label="Highest qualification" name="highestQualification" value={String(profile.highestQualification ?? "")} onChange={change} /><Field label="Institution name" name="institutionName" value={String(profile.institutionName ?? "")} onChange={change} /><Field label="Completion year" name="completionYear" type="number" min="1950" max="2100" value={String(profile.completionYear ?? "")} onChange={change} /><label className="grid gap-1.5 text-sm font-semibold">Result type<select className={fieldClass} value={String(profile.resultType ?? "")} onChange={(event) => change("resultType", event.target.value)}><option value="">Select</option><option value="GPA">GPA</option><option value="PERCENTAGE">Percentage</option></select></label><Field label="Result value" name="resultValue" type="number" step="0.01" value={String(profile.resultValue ?? "")} onChange={change} /><label className="grid gap-1.5 text-sm font-semibold">English test<select className={fieldClass} value={String(profile.englishTestType ?? "NONE")} onChange={(event) => change("englishTestType", event.target.value)}><option value="NONE">None</option><option value="IELTS">IELTS</option><option value="PTE">PTE</option><option value="DUOLINGO">Duolingo</option></select></label><Field label="English test score" name="englishTestScore" type="number" step="0.1" value={String(profile.englishTestScore ?? "")} onChange={change} /></div></Panel><Panel title="Study preferences"><div className="grid gap-4 md:grid-cols-2"><Field label="Preferred country" name="preferredCountry" value={String(profile.preferredCountry ?? "")} onChange={change} /><Field label="Preferred study level" name="preferredStudyLevel" value={String(profile.preferredStudyLevel ?? "")} onChange={change} /><Field label="Intended intake" name="intendedIntake" value={String(profile.intendedIntake ?? "")} onChange={change} /><label className="grid gap-1.5 text-sm font-semibold">Previous visa refusal<select className={fieldClass} value={profile.previousVisaRefusal === undefined ? "" : String(profile.previousVisaRefusal)} onChange={(event) => { setProfile((current) => ({ ...current, previousVisaRefusal: event.target.value === "" ? undefined : event.target.value === "true" })); setDirty(true); }}><option value="">Select</option><option value="false">No</option><option value="true">Yes</option></select></label>{profile.previousVisaRefusal && <label className="grid gap-1.5 text-sm font-semibold md:col-span-2">Short refusal explanation<textarea className={`${fieldClass} min-h-24`} maxLength={500} value={String(profile.refusalExplanation ?? "")} onChange={(event) => change("refusalExplanation", event.target.value)} /></label>}</div></Panel></form></AppShell>;
}
