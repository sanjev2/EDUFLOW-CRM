import { ArrowRight, BellRing, Check, CheckCircle2, ClipboardCheck, FileClock, LockKeyhole, Route, ShieldCheck, Sparkles, UserRoundCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { PublicLayout } from "@/components/public-layout";

const problems = [
  ["Scattered student records", "Keep profiles, applications and follow-up context together in one role-aware workspace."],
  ["Missed follow-ups", "Create timely tasks automatically and give counsellors a clear view of what needs attention."],
  ["Unclear progress", "Make each application stage visible with a dependable history of changes."],
  ["Weak accountability", "Use assignments, security alerts and audit activity to understand who did what."],
] as const;
const workflow = ["Enquiry", "Counselling", "Application", "Documentation", "Decision", "Enrolment"];
const roles = [
  { icon: UserRoundCheck, label: "For students", title: "Know what comes next", text: "Complete your profile, start an enquiry and follow your application journey from a clear personal dashboard.", points: ["Application timeline", "Counsellor visibility", "Secure account controls"] },
  { icon: ClipboardCheck, label: "For counsellors", title: "Focus on the right follow-up", text: "Review assigned students, record counselling context and work through prioritised follow-up tasks.", points: ["Assigned student list", "Stage management", "Task tracking"] },
  { icon: UsersRound, label: "For administrators", title: "Run a more accountable team", text: "See workload, manage assignments and review operational and security activity across the consultancy.", points: ["Team oversight", "Audit activity", "Security alerts"] },
] as const;
const automations = [
  [Route, "Balanced assignment", "New enquiries can be routed to the active counsellor with the lightest workload."],
  [BellRing, "Follow-up tasks", "A timely follow-up task is created when a student begins their journey."],
  [FileClock, "Stage history", "Application changes form a clear, dependable timeline."],
  [ShieldCheck, "Security awareness", "Important activity is surfaced through alerts and audit trails."],
] as const;

function ProductPreview() {
  return <div className="landing-preview" aria-label="EduFlow dashboard preview">
    <div className="preview-sidebar">
      <div className="preview-brand"><span><Sparkles size={14} /></span>EduFlow</div>
      {["Overview", "Students", "Tasks", "Applications"].map((item, index) => <div key={item} className={`preview-nav ${index === 0 ? "preview-nav-active" : ""}`}><span />{item}</div>)}
    </div>
    <div className="preview-main">
      <div className="preview-top"><div><small>COUNSELLOR WORKSPACE</small><strong>Good morning, Anisha</strong></div><div className="preview-avatar">AS</div></div>
      <div className="preview-metrics">
        <div><small>ASSIGNED STUDENTS</small><strong>24</strong><span>Active caseload</span></div>
        <div><small>FOLLOW-UPS</small><strong>7</strong><span>3 due today</span></div>
        <div><small>NEW ENQUIRIES</small><strong>4</strong><span>Ready to review</span></div>
      </div>
      <div className="preview-grid">
        <div className="preview-panel"><div className="preview-title"><strong>Application progress</strong><span>This week</span></div>{[["Enquiry", "84%"], ["Counselling", "66%"], ["Application", "48%"], ["Decision", "23%"]].map(([name, width]) => <div className="preview-progress" key={name}><span>{name}</span><i><b style={{ width }} /></i></div>)}</div>
        <div className="preview-panel"><div className="preview-title"><strong>Next follow-ups</strong><span>View all</span></div>{["Riya Sharma", "Niraj Thapa", "Suman Rai"].map((name, index) => <div className="preview-person" key={name}><em>{name.split(" ").map((part) => part[0]).join("")}</em><span><strong>{name}</strong><small>{index === 0 ? "Due today" : `Due in ${index + 1} days`}</small></span><CheckCircle2 size={17} /></div>)}</div>
      </div>
    </div>
  </div>;
}

export default function Home() {
  return <PublicLayout>
    <section className="landing-hero">
      <div className="landing-orb landing-orb-one" /><div className="landing-orb landing-orb-two" />
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 lg:grid-cols-[.92fr_1.08fr] lg:px-8 lg:py-24">
        <div className="relative z-10">
          <p className="landing-eyebrow"><span />Built for education consultancies in Nepal</p>
          <h1 className="mt-6 max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-[-.04em] text-white sm:text-5xl lg:text-6xl">Guide every student from first enquiry to enrolment.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-blue-100">EduFlow brings student records, counselling work, application progress and team accountability into one secure, focused workspace.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link className="landing-primary-button" href="/register">Get started <ArrowRight aria-hidden size={18} /></Link><Link className="landing-secondary-button" href="/login">Sign in</Link></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-blue-100"><span className="flex items-center gap-2"><Check size={16} />Role-based access</span><span className="flex items-center gap-2"><Check size={16} />Clear application history</span><span className="flex items-center gap-2"><Check size={16} />Built-in accountability</span></div>
        </div>
        <ProductPreview />
      </div>
    </section>

    <section id="product" className="landing-section bg-white">
      <div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="section-kicker">One connected workspace</p><h2 className="section-title">Replace operational gaps with a clearer student journey</h2><p className="section-copy">Give your team a reliable place to work while giving students a simple view of their own progress.</p></div>
      <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">{problems.map(([title, text], index) => <article className="problem-card" key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div>
    </section>

    <section id="workflow" className="landing-section bg-[var(--app-background)]">
      <div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="grid items-end gap-8 lg:grid-cols-2"><div><p className="section-kicker">A journey everyone can follow</p><h2 className="section-title">Progress that stays visible from start to finish</h2></div><p className="section-copy lg:pb-2">Track documentation readiness as a checklist and workflow stage—without implying private document storage. Every supported change remains visible in the application history.</p></div>
      <ol className="workflow-track">{workflow.map((item, index) => <li key={item}><span>{index + 1}</span><div><strong>{item}</strong><small>{index === 3 ? "Checklist tracking" : index === 5 ? "Journey complete" : "Clear next step"}</small></div>{index < workflow.length - 1 && <ArrowRight aria-hidden />}</li>)}</ol></div>
    </section>

    <section id="consultancies" className="landing-section bg-white">
      <div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="section-kicker">Designed for every role</p><h2 className="section-title">The right information for the person who needs it</h2></div>
      <div className="mt-12 grid gap-6 lg:grid-cols-3">{roles.map(({ icon: Icon, label, title, text, points }) => <article className="role-card" key={label}><span className="role-icon"><Icon aria-hidden /></span><p className="role-label">{label}</p><h3>{title}</h3><p>{text}</p><ul>{points.map((point) => <li key={point}><CheckCircle2 aria-hidden size={18} />{point}</li>)}</ul></article>)}</div></div>
    </section>

    <section className="landing-section bg-[var(--navy)] text-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[.8fr_1.2fr] lg:px-8"><div><p className="landing-eyebrow"><span />Practical automation</p><h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">Less chasing. More time for student guidance.</h2><p className="mt-5 leading-7 text-blue-100">EduFlow automates the repetitive hand-offs already supported by your workflow, while keeping people in control of decisions.</p></div><div className="grid gap-4 sm:grid-cols-2">{automations.map(([Icon, title, text]) => <article className="automation-card" key={title}><Icon aria-hidden /><h3>{title}</h3><p>{text}</p></article>)}</div></div>
    </section>

    <section id="security" className="landing-section bg-[var(--light-blue)]/35">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-2 lg:px-8"><div className="security-visual"><div className="security-ring"><div><LockKeyhole aria-hidden size={34} /><strong>Protected workspace</strong><span>Access that follows each person&apos;s role</span></div></div><span className="security-chip chip-one">Secure sessions</span><span className="security-chip chip-two">Audit activity</span><span className="security-chip chip-three">Admin MFA</span></div><div><p className="section-kicker">Security people can understand</p><h2 className="section-title">Student information deserves thoughtful protection</h2><p className="section-copy">EduFlow uses secure account and access controls throughout the experience, without making security harder for your team to use.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{["Secure sessions", "Administrator MFA", "Role-based access", "CSRF protection", "Password safeguards", "Audit activity"].map((item) => <div className="security-item" key={item}><ShieldCheck aria-hidden size={19} />{item}</div>)}</div></div></div>
    </section>

    <section className="bg-white px-5 py-16 lg:px-8 lg:py-24"><div className="final-cta mx-auto max-w-7xl"><div><p>Ready for a clearer workflow?</p><h2>Bring every student journey into focus.</h2></div><div className="flex flex-col gap-3 sm:flex-row"><Link className="landing-primary-button" href="/register">Get started <ArrowRight size={18} /></Link><Link className="landing-secondary-button" href="/login">Sign in</Link></div></div></section>
  </PublicLayout>;
}
