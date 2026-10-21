import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowLeft, ArrowRight, Beaker, BookOpen, Check, CircleHelp, Clipboard, FileText,
  FlaskConical, FolderKanban, LoaderCircle, LogOut, MessageSquare, Plus, Search, Settings2,
  Sparkles, Users, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import {
  getGetExperimentQueryKey, getGetNotebookOverviewQueryKey, getGetProjectInviteQueryKey,
  getGetProjectQueryKey, getListExperimentAttachmentsQueryKey, getListProjectsQueryKey,
  useAcceptProjectInvite, useAddExperimentAttachment, useAddExperimentComment,
  useCreateExperiment, useCreateProject, useCreateProjectInvite, useDeleteExperiment,
  useGetExperiment, useGetNotebookOverview, useGetProject, useGetProjectInvite,
  useListExperimentAttachments, useListProjects, useOrganizeExperimentNotes,
  useRequestUploadUrl, useUpdateExperiment, useUpdateProject,
} from '@workspace/api-client-react';
import type { ExperimentNotesOutput, Project, ProjectDetail, ProjectStatus } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#d97834', colorForeground: '#25313d', colorMutedForeground: '#68727b',
    colorDanger: '#a34238', colorBackground: '#fffdf8', colorInput: '#f8f5ed',
    colorInputForeground: '#25313d', colorNeutral: '#d9d3c7', fontFamily: 'DM Sans',
    borderRadius: '0.65rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf8] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#25313d] font-semibold',
    headerSubtitle: 'text-[#68727b]',
    socialButtonsBlockButtonText: 'text-[#25313d]',
    formFieldLabel: 'text-[#35414a]',
    footerActionLink: 'text-[#a7501d]',
    footerActionText: 'text-[#68727b]',
    dividerText: 'text-[#68727b]',
    identityPreviewEditButton: 'text-[#a7501d]',
    formFieldSuccessText: 'text-[#286b59]',
    alertText: 'text-[#a34238]',
    logoBox: 'mb-3',
    logoImage: 'h-9',
    socialButtonsBlockButton: 'border-[#d9d3c7] bg-[#fffdf8]',
    formButtonPrimary: 'bg-[#d97834] text-[#242d35]',
    formFieldInput: 'border-[#d9d3c7] bg-[#f8f5ed] text-[#25313d]',
    footerAction: 'text-[#68727b]',
    dividerLine: 'bg-[#d9d3c7]',
    alert: 'border-[#a34238]',
    otpCodeFieldInput: 'border-[#d9d3c7] bg-[#f8f5ed] text-[#25313d]',
    formFieldRow: 'mb-4',
    main: 'text-[#25313d]',
  },
};

type Notice = { text: string; id: number };
function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const inform = (text: string) => {
    const id = Date.now();
    setNotice({ text, id });
    window.setTimeout(() => setNotice((current) => current?.id === id ? null : current), 2800);
  };
  return { notice, inform };
}
function Toast({ notice }: { notice: Notice | null }) {
  return notice ? <div className="toast" role="status">{notice.text}</div> : null;
}
function Brand() {
  return <div className="brand"><span className="brand-mark">∿</span><span><span className="brand-name">Fieldnotes</span><span className="brand-kicker">Academic notebook</span></span></div>;
}
function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== userId) cache.clear();
    previous.current = userId;
  }), [addListener, cache]);
  return null;
}
function LogoutButton({ compact = false }: { compact?: boolean }) {
  const { signOut } = useClerk();
  return <button className={`button ghost ${compact ? '' : 'logout-label'}`} type="button" aria-label="Sign out" data-testid="button-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })}><LogOut size={15}/>{!compact && 'Sign out'}</button>;
}
function SignInPage() {
  return <div className="landing" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 22 }}><div><div style={{ margin: '0 auto 25px', width: 'fit-content' }}><Link href="/"><Brand /></Link></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>;
}
function SignUpPage() {
  return <div className="landing" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 22 }}><div><div style={{ margin: '0 auto 25px', width: 'fit-content' }}><Link href="/"><Brand /></Link></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>;
}
function PublicHome() {
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><Landing /></Show></>;
}
function Landing() {
  return <main className="landing grain">
    <header className="landing-nav"><Link href="/"><Brand /></Link><div className="landing-links"><Link className="button ghost" href="/sign-in">Sign in</Link><Link className="button primary" href="/sign-up">Start your notebook <ArrowRight size={14}/></Link></div></header>
    <section className="landing-hero">
      <div className="hero-copy fade-up"><div className="hero-eyebrow"><span className="hero-dot"/> A shared record of the work</div>
        <h1 className="hero-title">Research,<br/><em>remembered.</em></h1>
        <p className="hero-subtitle">A careful place for experiments to take shape: documented with context, reviewed together, and easy to trace back to the work.</p>
        <div className="hero-ctas"><Link className="button primary" href="/sign-up">Create your notebook <ArrowRight size={15}/></Link><Link className="button" href="/sign-in">Sign in</Link></div>
      </div>
      <div className="hero-art fade-up" aria-label="Illustration of an organized experiment record">
        <div className="orbit"><span className="orbit-label top">Research record · 01</span><span className="orbit-label right">Document / review / trace</span></div>
        <div className="record-sheet"><span className="sheet-index">FIELDNOTES  /  RESEARCH LOG</span><h2 className="sheet-heading">A question worth keeping.</h2><div className="sheet-rule"><span>Hypothesis</span><div className="sheet-line"/><div className="sheet-line short"/></div><div className="sheet-rule"><span>Protocol</span><div className="sheet-line"/><div className="sheet-line short"/></div><div className="sheet-rule"><span>Observations</span><div className="sheet-line"/></div></div>
      </div>
    </section>
    <section className="landing-section"><div className="landing-inner">
      <div className="eyebrow">Built for the continuity of research</div><h2>One record, from first idea to final observation.</h2>
      <p>Experiments belong in a living notebook—not scattered across disconnected files. Fieldnotes keeps the why, how, and what happened in one traceable place.</p>
      <div className="landing-feature-grid"><div className="feature-list">
        <article className="feature-item"><span className="feature-number">01 / STRUCTURE</span><h3>Every part has a place</h3><p>Hypothesis, materials, protocol, observations, results, and conclusion stay together as the experiment evolves.</p></article>
        <article className="feature-item"><span className="feature-number">02 / CONTEXT</span><h3>Work is shared with care</h3><p>Bring scholars and guides into the same project, with comments attached to the record they are discussing.</p></article>
        <article className="feature-item"><span className="feature-number">03 / TRACEABILITY</span><h3>History stays legible</h3><p>Dates, authorship, status, attachments, and discussion remain visible alongside the research itself.</p></article>
        <article className="feature-item"><span className="feature-number">04 / MOMENTUM</span><h3>Rough notes can begin</h3><p>Turn field notes into an editable structured draft, then review every section before it becomes part of the record.</p></article>
      </div><aside className="landing-quote"><blockquote>“Good documentation is how a question survives the day it was asked.”</blockquote><span>A workbench for careful inquiry</span></aside></div>
    </div></section>
    <section className="landing-end"><div className="landing-inner"><div className="eyebrow">A better record of the work</div><h2>Keep the next discovery connected.</h2><Link className="button primary" href="/sign-up">Open a notebook <ArrowRight size={15}/></Link></div></section>
    <footer className="landing-footer"><span>Fieldnotes · Academic Lab Notebook</span><span>For scholars and their guides</span></footer>
  </main>;
}

function AppShell({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [path] = useLocation();
  const firstName = user?.firstName || user?.fullName || 'Researcher';
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const initials = (user?.firstName?.[0] || user?.primaryEmailAddress?.emailAddress?.[0] || 'R').toUpperCase();
  return <Show when="signed-in"><div className="app-frame">
    <aside className="sidebar"><Link href="/dashboard"><Brand/></Link><nav aria-label="Main navigation"><div className="nav-group-label">Workspace</div>
      <Link href="/dashboard" className={`nav-link ${path === '/dashboard' ? 'active' : ''}`}><Activity size={17}/><span>Overview</span></Link>
      <Link href="/projects" className={`nav-link ${path.startsWith('/projects') ? 'active' : ''}`}><FolderKanban size={17}/><span>Projects</span></Link>
      <div className="nav-group-label" style={{ marginTop: 24 }}>Notebook</div>
      <Link href="/projects" className="nav-link"><BookOpen size={17}/><span>Experiment records</span></Link>
    </nav><div className="sidebar-bottom"><div className="user-row"><div className="avatar">{initials}</div><div className="user-meta"><div className="user-name">{firstName}</div><div className="user-email">{email}</div></div><LogoutButton compact/></div></div></aside>
    <div className="main-area"><header className="topbar"><div className="breadcrumb">Research workbench <span style={{ padding: '0 8px', opacity: .45 }}>/</span> {path === '/dashboard' ? 'Overview' : path.startsWith('/projects') ? 'Projects' : 'Experiment record'}</div><div className="top-actions"><span className="eyebrow" style={{ letterSpacing: '.05em' }}>ACADEMIC LAB NOTEBOOK</span><div className="mobile-account"><div className="avatar">{initials}</div><LogoutButton compact/></div></div></header>{children}</div>
  </div></Show>;
}
function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in"><AppShell>{children}</AppShell></Show><Show when="signed-out"><Redirect to="/"/></Show></>;
}
function Skeletons({ count = 3 }: { count?: number }) {
  return <div className="panel panel-pad" aria-label="Loading records">{Array.from({ length: count }, (_, i) => <div key={i} style={{ display: 'flex', gap: 15, padding: '13px 0', borderTop: i ? '1px solid hsl(var(--border))' : 0 }}><div className="skeleton" style={{ width: 40, height: 40, borderRadius: 9 }}/><div style={{ flex: 1 }}><div className="skeleton" style={{ width: '40%', margin: '4px 0 10px' }}/><div className="skeleton" style={{ width: '68%' }}/></div></div>)}</div>;
}
function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return <div className="empty-state"><div className="empty-mark"><CircleHelp size={19}/></div><h3>Could not load this record</h3><p>There was a problem reaching the notebook. Your work has not been changed.</p><button className="button" onClick={onRetry} data-testid="button-retry">Try again</button></div>;
}
function EmptyState({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark"><FlaskConical size={18}/></div><h3>{title}</h3><p>{copy}</p>{action}</div>;
}
function StatusPill({ status }: { status: string }) {
  const label = status.replace('_', ' ');
  return <span className={`pill ${status}`}><span style={{ width: 5, height: 5, background: 'currentColor', borderRadius: '50%' }}/>{label}</span>;
}
function dateLabel(value?: string) {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
function isServiceUnavailable(error: unknown): boolean {
  if (typeof error === 'string') return /\b503\b/.test(error);
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; statusCode?: unknown; message?: unknown; response?: { status?: unknown } };
  return candidate.status === 503 || candidate.statusCode === 503 || candidate.response?.status === 503 ||
    (typeof candidate.message === 'string' && /\b503\b/.test(candidate.message));
}
function Modal({ title, onClose, children, kicker = 'WORKSPACE ACTION' }: { title: string; onClose: () => void; children: ReactNode; kicker?: string }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><div className="eyebrow">{kicker}</div><h2 className="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close" data-testid="button-close-modal"><X size={17}/></button></div>{children}</section></div>;
}
function DashboardPage() {
  const query = useGetNotebookOverview();
  const projects = query.data?.projects ?? [];
  const records = query.data?.recentExperiments ?? [];
  return <div className="content fade-up">
    <div className="page-head"><div><div className="eyebrow">Your research, in view</div><h1 className="page-title">Overview</h1><p className="page-subtitle">A current view of your projects and the experiments moving through them.</p></div><Link className="button primary" href="/projects"><Plus size={15}/> New project</Link></div>
    {query.isLoading ? <Skeletons/> : query.isError ? <ErrorPanel onRetry={() => query.refetch()}/> : <>
      <div className="stat-grid">
        <div className="panel stat-card"><div className="section-label">Active projects</div><div className="stat-number">{query.data?.activeProjects ?? 0}</div></div>
        <div className="panel stat-card"><div className="section-label">Experiments this week</div><div className="stat-number">{query.data?.experimentsThisWeek ?? 0}</div></div>
        <div className="panel stat-card"><div className="section-label">Completed experiments</div><div className="stat-number">{query.data?.awaitingReview ?? 0}</div></div>
      </div>
      <div className="dashboard-grid"><section className="panel panel-pad"><div className="panel-heading"><h2 className="panel-title">Recent experiment records</h2><Link className="button ghost" href="/projects">All projects <ArrowRight size={14}/></Link></div>
        {!records.length ? <EmptyState title="No recent records" copy="Experiments from your projects will appear here as the work is documented." action={<Link className="button" href="/projects">Browse projects</Link>}/> : records.map((record) => <Link key={record.id} href={`/experiments/${record.id}`} className="experiment-row" data-testid={`row-recent-experiment-${record.id}`}><div className="project-sigil"><Beaker size={18}/></div><div><div className="row-title">{record.title}</div><div className="row-caption">{record.projectTitle} · {record.authorName} · {dateLabel(record.updatedAt)}</div></div><div className="row-spacer"/><StatusPill status={record.status}/><ArrowRight size={14} color="hsl(var(--muted-foreground))"/></Link>)}
      </section><section className="panel panel-pad"><div className="panel-heading"><h2 className="panel-title">Projects</h2><Link className="button ghost" href="/projects"><ArrowRight size={14}/></Link></div>
        {!projects.length ? <EmptyState title="Start with a project" copy="A project brings collaborators and experiment records into one shared space." action={<Link className="button primary" href="/projects">Create project <Plus size={14}/></Link>}/> : projects.slice(0, 5).map((project) => <ProjectRow key={project.id} project={project}/>)}
      </section></div>
    </>}
  </div>;
}
function ProjectRow({ project }: { project: Project }) {
  return <Link href={`/projects/${project.id}`} className="project-row" data-testid={`row-project-${project.id}`}><div className="project-sigil">{project.discipline.slice(0, 1).toUpperCase()}</div><div><div className="row-title">{project.title}</div><div className="row-caption">{project.discipline} · {project.experimentCount} records</div></div><div className="row-spacer"/><StatusPill status={project.status}/></Link>;
}
function ProjectsPage() {
  const query = useListProjects();
  const create = useCreateProject();
  const cache = useQueryClient();
  const { notice, inform } = useNotice();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ title: '', discipline: '', description: '', role: 'scholar' as 'scholar' | 'guide' });
  const filtered = useMemo(() => (query.data ?? []).filter((project) => `${project.title} ${project.discipline} ${project.description}`.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ data: { ...form } }, { onSuccess: async (project) => { await Promise.all([cache.invalidateQueries({ queryKey: getListProjectsQueryKey() }), cache.invalidateQueries({ queryKey: getGetNotebookOverviewQueryKey() })]); setOpen(false); setForm({ title: '', discipline: '', description: '', role: 'scholar' }); setLocation(`/projects/${project.id}`); inform('Project created'); }, onError: () => inform('Project could not be created. Please try again.') });
  }
  return <div className="content fade-up"><div className="page-head"><div><div className="eyebrow">Shared research spaces</div><h1 className="page-title">Projects</h1><p className="page-subtitle">Keep the people, records, and decisions around each line of inquiry together.</p></div><button className="button primary" onClick={() => setOpen(true)} data-testid="button-create-project"><Plus size={15}/> Create project</button></div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 15 }}><label style={{ width: 'min(300px,100%)', position: 'relative' }}><Search size={15} style={{ position: 'absolute', left: 11, top: 12, color: 'hsl(var(--muted-foreground))' }}/><input className="input" style={{ paddingLeft: 34 }} placeholder="Find a project" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a project" data-testid="input-search-projects"/></label></div>
    {query.isLoading ? <Skeletons count={4}/> : query.isError ? <ErrorPanel onRetry={() => query.refetch()}/> : !filtered.length ? <EmptyState title={search ? 'No matching projects' : 'Your notebook begins here'} copy={search ? 'Try another title, discipline, or phrase.' : 'Create a project to give your research a shared and traceable home.'} action={!search && <button className="button primary" onClick={() => setOpen(true)}><Plus size={14}/> Create project</button>}/> : <div className="project-grid">{filtered.map((project) => <ProjectCard key={project.id} project={project}/>)}</div>}
    {open && <Modal title="Create a project" onClose={() => setOpen(false)}><form onSubmit={submit}><div className="form-grid"><div className="field full"><label htmlFor="project-title">Project title</label><input id="project-title" required maxLength={180} className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="input-project-title"/></div><div className="field"><label htmlFor="project-discipline">Discipline</label><input id="project-discipline" required maxLength={100} className="input" value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })} data-testid="input-project-discipline"/></div><div className="field"><label htmlFor="project-role">Your role</label><select id="project-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'scholar' | 'guide' })}><option value="scholar">Scholar</option><option value="guide">Guide</option></select></div><div className="field full"><label htmlFor="project-description">Description <span className="status-note">Optional</span></label><textarea id="project-description" className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-project-description"/></div></div>{create.isError && <div className="inline-error">The project could not be created. Review the details and try again.</div>}<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}><button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button><button className="button primary" disabled={create.isPending} data-testid="button-submit-project">{create.isPending ? 'Creating…' : 'Create project'}</button></div></form></Modal>}
    <Toast notice={notice}/>
  </div>;
}
function ProjectCard({ project }: { project: Project }) {
  return <Link href={`/projects/${project.id}`} className="panel project-card" data-testid={`card-project-${project.id}`}><div className="project-card-top"><span className="section-label">{project.discipline}</span><StatusPill status={project.status}/></div><h2>{project.title}</h2><p>{project.description || 'No description added.'}</p><div className="card-foot"><span><Users size={13} style={{ verticalAlign: 'middle', marginRight: 4 }}/>{project.memberCount} members</span><span><FileText size={13} style={{ verticalAlign: 'middle', marginRight: 4 }}/>{project.experimentCount} records</span><span style={{ marginLeft: 'auto' }}>{dateLabel(project.updatedAt)}</span></div></Link>;
}
function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const id = Number(params.projectId);
  const query = useGetProject(id);
  const createExperiment = useCreateExperiment();
  const updateProject = useUpdateProject();
  const inviteMutation = useCreateProjectInvite();
  const cache = useQueryClient();
  const [, setLocation] = useLocation();
  const { notice, inform } = useNotice();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [invite, setInvite] = useState({ email: '', role: 'scholar' as 'scholar' | 'guide' });
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string; expiresAt: string } | null>(null);
  const [experimentTitle, setExperimentTitle] = useState('');
  const project = query.data;
  async function refreshProject() {
    await Promise.all([cache.invalidateQueries({ queryKey: getGetProjectQueryKey(id) }), cache.invalidateQueries({ queryKey: getListProjectsQueryKey() }), cache.invalidateQueries({ queryKey: getGetNotebookOverviewQueryKey() })]);
  }
  function createRecord(e: FormEvent) {
    e.preventDefault();
    createExperiment.mutate({ projectId: id, data: { title: experimentTitle } }, { onSuccess: async (record) => { await refreshProject(); setCreateOpen(false); setExperimentTitle(''); setLocation(`/experiments/${record.id}`); inform('Experiment record created'); }, onError: () => inform('Experiment could not be created.') });
  }
  function makeInvite(e: FormEvent) {
    e.preventDefault();
    inviteMutation.mutate({ projectId: id, data: { ...invite, role: project?.role === 'guide' ? invite.role : 'scholar' } }, { onSuccess: (result) => { setInviteResult(result); inform('Invitation link ready'); }, onError: () => inform('Invitation could not be created.') });
  }
  function updateStatus(status: ProjectStatus) {
    updateProject.mutate({ projectId: id, data: { status } }, { onSuccess: refreshProject, onError: () => inform('Project status could not be updated.') });
  }
  if (query.isLoading) return <div className="content"><Skeletons count={4}/></div>;
  if (query.isError || !project) return <div className="content"><ErrorPanel onRetry={() => query.refetch()}/></div>;
  const inviteAbsoluteUrl = inviteResult ? new URL(inviteResult.inviteUrl, window.location.origin).toString() : '';
  return <div className="content fade-up">
    <div style={{ marginBottom: 20 }}><Link href="/projects" className="button ghost" style={{ paddingLeft: 0 }}><ArrowLeft size={14}/> Projects</Link></div>
     <div className="page-head"><div><div className="eyebrow">{project.discipline} · {project.role}</div><h1 className="page-title">{project.title}</h1><p className="page-subtitle">{project.description || 'Shared project notebook.'}</p></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{project.role === 'guide' && <button className="button" onClick={() => { setEditOpen(true); }} data-testid="button-edit-project"><Settings2 size={15}/> Project details</button>}<button className="button" onClick={() => { setInviteOpen(true); setInviteResult(null); }} data-testid="button-invite-member"><Users size={15}/> Invite collaborator</button><button className="button primary" onClick={() => setCreateOpen(true)} data-testid="button-create-experiment"><Plus size={15}/> New experiment</button></div></div>
    <div className="dashboard-grid"><section className="panel panel-pad"><div className="panel-heading"><div><div className="section-label">Research records</div><h2 className="panel-title" style={{ marginTop: 6 }}>Experiments</h2></div><span className="status-note">{project.experimentCount} total</span></div>
      {!project.experiments.length ? <EmptyState title="No experiments recorded" copy="Start the first experiment record. Add protocol, observations, and results as the work develops." action={<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={14}/> New experiment</button>}/> : <div className="table-wrap"><div className="table-row table-head"><span>Record</span><span>Status</span><span>Experiment date</span><span>Updated</span></div>{project.experiments.map((exp) => <div className="table-row" key={exp.id} data-testid={`row-experiment-${exp.id}`}><Link href={`/experiments/${exp.id}`} className="table-link"><div className="row-title">{exp.title}</div><div className="row-caption">{exp.authorName} · {exp.commentCount} comments · {exp.attachmentCount} files</div></Link><span><StatusPill status={exp.status}/></span><span className="status-note">{dateLabel(exp.experimentDate)}</span><span className="status-note">{dateLabel(exp.updatedAt)}</span></div>)}</div>}
    </section><aside className="panel panel-pad"><div className="panel-heading"><div><div className="section-label">Shared workspace</div><h2 className="panel-title" style={{ marginTop: 6 }}>People</h2></div><button className="icon-button" aria-label="Invite a collaborator" onClick={() => { setInviteOpen(true); setInviteResult(null); }}><Plus size={16}/></button></div>
      {project.members.length === 0 ? <div className="status-note">No members are listed for this project.</div> : project.members.map((member) => <div className="project-row" key={member.id}><div className="avatar" style={{ background: 'hsl(var(--secondary))', color: 'hsl(var(--secondary-foreground))' }}>{member.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('').toUpperCase()}</div><div style={{ minWidth: 0 }}><div className="row-title">{member.name}</div><div className="row-caption">{member.email}</div></div><div className="row-spacer"/><span className="pill">{member.role}</span></div>)}
       {project.role === 'guide' && <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: 16, marginTop: 12 }}><div className="section-label" style={{ marginBottom: 10 }}>Project status</div><select className="select" value={project.status} disabled={updateProject.isPending} aria-label="Project status" onChange={(e) => updateStatus(e.target.value as ProjectStatus)} data-testid="select-project-status"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></div>}
    </aside></div>
    {createOpen && <Modal title="New experiment record" onClose={() => setCreateOpen(false)}><form onSubmit={createRecord}><div className="field"><label htmlFor="experiment-title">Experiment title</label><input id="experiment-title" className="input" required maxLength={180} value={experimentTitle} onChange={(e) => setExperimentTitle(e.target.value)} data-testid="input-experiment-title"/></div>{createExperiment.isError && <div className="inline-error">Could not create this record. Try again.</div>}<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 21 }}><button type="button" className="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="button primary" disabled={createExperiment.isPending}>{createExperiment.isPending ? 'Creating…' : 'Create record'}</button></div></form></Modal>}
    {inviteOpen && <Modal title={inviteResult ? 'Invitation link' : 'Invite a collaborator'} onClose={() => setInviteOpen(false)} kicker="PROJECT COLLABORATION">{inviteResult ? <div><p className="page-subtitle" style={{ margin: '0 0 16px' }}>Share this link with your collaborator. It expires {dateLabel(inviteResult.expiresAt)}.</p><div className="invite-link-row"><input className="input" readOnly value={inviteAbsoluteUrl} aria-label="Invitation link" data-testid="input-invite-url"/><button className="button primary" onClick={async () => { await navigator.clipboard.writeText(inviteAbsoluteUrl); inform('Invitation link copied'); }} data-testid="button-copy-invite"><Clipboard size={15}/> Copy</button></div><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}><button className="button" onClick={() => setInviteOpen(false)}>Done</button></div></div> : <form onSubmit={makeInvite}><div className="form-grid"><div className="field full"><label htmlFor="invite-email">Email address</label><input id="invite-email" type="email" required className="input" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} data-testid="input-invite-email"/></div>{project.role === 'guide' ? <div className="field"><label htmlFor="invite-role">Project role</label><select id="invite-role" className="select" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as 'scholar' | 'guide' })}><option value="scholar">Scholar</option><option value="guide">Guide</option></select></div> : <div className="field"><label>Project role</label><div className="status-note" style={{ padding: '11px 0' }}>Scholar</div></div>}</div>{inviteMutation.isError && <div className="inline-error">Invitation could not be created. Try again.</div>}<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 21 }}><button type="button" className="button" onClick={() => setInviteOpen(false)}>Cancel</button><button className="button primary" disabled={inviteMutation.isPending}>{inviteMutation.isPending ? 'Preparing…' : 'Create invite link'}</button></div></form>}</Modal>}
    {editOpen && <ProjectSettings project={project} onClose={() => setEditOpen(false)} onSaved={refreshProject} inform={inform}/>}
    <Toast notice={notice}/>
  </div>;
}
function ProjectSettings({ project, onClose, onSaved, inform }: { project: ProjectDetail; onClose: () => void; onSaved: () => Promise<void>; inform: (message: string) => void }) {
  const update = useUpdateProject();
  const [form, setForm] = useState({ title: project.title, discipline: project.discipline, description: project.description });
  function submit(e: FormEvent) {
    e.preventDefault();
    update.mutate({ projectId: project.id, data: form }, { onSuccess: async () => { await onSaved(); inform('Project details saved'); onClose(); }, onError: () => inform('Project details could not be saved.') });
  }
  return <Modal title="Project details" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><div className="field full"><label htmlFor="edit-project-title">Title</label><input id="edit-project-title" required maxLength={180} className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/></div><div className="field full"><label htmlFor="edit-project-discipline">Discipline</label><input id="edit-project-discipline" required maxLength={100} className="input" value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })}/></div><div className="field full"><label htmlFor="edit-project-description">Description</label><textarea id="edit-project-description" className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></div></div>{update.isError && <div className="inline-error">Could not save project details.</div>}<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save details'}</button></div></form></Modal>;
}

type ExperimentForm = {
  title: string; status: 'planned' | 'in_progress' | 'complete'; experimentDate: string;
  hypothesis: string; materials: string; protocol: string; observations: string; results: string; conclusion: string;
};
const noteFields: Array<{ key: keyof ExperimentNotesOutput; label: string }> = [
  { key: 'title', label: 'Title' }, { key: 'hypothesis', label: 'Hypothesis' },
  { key: 'materials', label: 'Materials' }, { key: 'protocol', label: 'Protocol' },
  { key: 'observations', label: 'Observations' }, { key: 'results', label: 'Results' },
  { key: 'conclusion', label: 'Conclusion' },
];
function ExperimentPage() {
  const params = useParams<{ experimentId: string }>();
  const id = Number(params.experimentId);
  const query = useGetExperiment(id);
  const attachmentQuery = useListExperimentAttachments(id);
  const update = useUpdateExperiment();
  const addComment = useAddExperimentComment();
  const requestUpload = useRequestUploadUrl();
  const addAttachment = useAddExperimentAttachment();
  const organize = useOrganizeExperimentNotes();
  const remove = useDeleteExperiment();
  const cache = useQueryClient();
  const [, setLocation] = useLocation();
  const { notice, inform } = useNotice();
  const [form, setForm] = useState<ExperimentForm | null>(null);
  const [initializedFor, setInitializedFor] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [roughNotes, setRoughNotes] = useState('');
  const [roughCode, setRoughCode] = useState('');
  const [suggestion, setSuggestion] = useState<ExperimentNotesOutput | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [organizeError, setOrganizeError] = useState('');
  const record = query.data;
  useEffect(() => {
    if (record && initializedFor !== id) {
      setInitializedFor(id);
      setForm({
        title: record.title, status: record.status,
        experimentDate: record.experimentDate ? record.experimentDate.slice(0, 10) : '',
        hypothesis: record.hypothesis || '', materials: record.materials || '', protocol: record.protocol || '',
        observations: record.observations || '', results: record.results || '', conclusion: record.conclusion || '',
      });
    }
  }, [record, id, initializedFor]);
  async function invalidateExperiment() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: getGetExperimentQueryKey(id) }),
      cache.invalidateQueries({ queryKey: getListExperimentAttachmentsQueryKey(id) }),
      cache.invalidateQueries({ queryKey: getGetNotebookOverviewQueryKey() }),
      ...(record ? [cache.invalidateQueries({ queryKey: getGetProjectQueryKey(record.projectId) })] : []),
    ]);
  }
  function saveRecord(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    update.mutate({ experimentId: id, data: { ...form, experimentDate: form.experimentDate || undefined } }, { onSuccess: async () => { await invalidateExperiment(); inform('Experiment record saved'); }, onError: () => inform('Could not save this experiment.') });
  }
  function submitComment(e: FormEvent) {
    e.preventDefault();
    const body = comment.trim();
    if (!body) return;
    addComment.mutate({ experimentId: id, data: { body } }, { onSuccess: async () => { setComment(''); await invalidateExperiment(); inform('Comment added'); }, onError: () => inform('Comment could not be added.') });
  }
  async function uploadFile(file?: File) {
    if (!file) return;
    setUploadError('');
    try {
      const mime = file.type || 'application/octet-stream';
      const signed = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: mime } });
      const put = await fetch(signed.uploadURL, { method: 'PUT', headers: { 'Content-Type': mime }, body: file });
      if (!put.ok) throw new Error('The file upload was not accepted.');
      await addAttachment.mutateAsync({ experimentId: id, data: { fileName: file.name, contentType: mime, size: file.size, objectPath: signed.objectPath } });
      await invalidateExperiment();
      inform('Attachment added');
    } catch {
      setUploadError('Upload did not complete. Please try the file again.');
    }
  }
  async function uploadFiles(files: File[]) {
    for (const file of files) await uploadFile(file);
  }
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const pastedImages = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item, index) => {
        const file = item.getAsFile();
        if (!file) return null;
        if (file.name) return file;
        const extension = file.type.split('/')[1]?.split('+')[0] || 'png';
        return new File([file], `pasted-image-${Date.now()}-${index + 1}.${extension}`, { type: file.type });
      })
      .filter((file): file is File => file !== null);
    if (pastedImages.length) {
      event.preventDefault();
      void uploadFiles(pastedImages);
    }
  }
  function requestSuggestion(e: FormEvent) {
    e.preventDefault();
    setOrganizeError('');
    organize.mutate({ data: { notes: roughNotes, ...(roughCode.trim() ? { code: roughCode } : {}) } }, {
      onSuccess: (output) => setSuggestion(output),
      onError: (error) => {
        const unavailable = isServiceUnavailable(error);
        setOrganizeError(unavailable
          ? 'The organizer service returned 503 (service unavailable). It requires an OpenAI API key configured in project Secrets.'
          : 'The organizer could not prepare a draft. No experiment content has been changed.');
      },
    });
  }
  function applySuggestion() {
    if (!form || !suggestion) return;
    setForm({ ...form, ...suggestion });
    setSuggestion(null);
    setAiOpen(false);
    inform('Draft applied. Review and save the record when ready.');
  }
  if (query.isLoading) return <div className="content"><Skeletons count={5}/></div>;
  if (query.isError || !record || !form) return <div className="content"><ErrorPanel onRetry={() => query.refetch()}/></div>;
  const busyUpload = requestUpload.isPending || addAttachment.isPending;
  return <div className="content fade-up" onPaste={handlePaste}>
    <div style={{ marginBottom: 18 }}><Link href={`/projects/${record.projectId}`} className="button ghost" style={{ paddingLeft: 0 }}><ArrowLeft size={14}/> Back to project</Link></div>
    <div className="page-head"><div><div className="eyebrow">Experiment record · {record.authorName} · Created {dateLabel(record.createdAt)}</div><h1 className="page-title">{form.title || 'Untitled experiment'}</h1><p className="page-subtitle">Record the method and evidence as they happen. Changes remain yours until you save.</p></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button className="button" onClick={() => { setAiOpen(true); setSuggestion(null); setOrganizeError(''); }} data-testid="button-organize-notes"><Sparkles size={15}/> AI organizer · setup required</button><button className="button primary" onClick={(e) => saveRecord(e as unknown as FormEvent)} disabled={update.isPending} data-testid="button-save-experiment">{update.isPending ? 'Saving…' : <><Check size={15}/> Save record</>}</button></div></div>
    {update.isError && <div className="inline-error">The last save failed. Your edits are still here; try saving again.</div>}
    <div className="editor-layout"><form className="editor-sections" onSubmit={saveRecord}>
      <section className="panel editor-section"><div className="section-label">Record identity</div><div className="form-grid" style={{ marginTop: 14 }}><div className="field full"><label htmlFor="record-title">Experiment title</label><input id="record-title" className="input" required maxLength={180} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="input-record-title"/></div><div className="field"><label htmlFor="record-status">Status</label><select id="record-status" className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ExperimentForm['status'] })} data-testid="select-record-status"><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="complete">Complete</option></select></div><div className="field"><label htmlFor="record-date">Experiment date</label><input id="record-date" type="date" className="input" value={form.experimentDate} onChange={(e) => setForm({ ...form, experimentDate: e.target.value })} data-testid="input-record-date"/></div></div></section>
      {noteFields.filter((field) => field.key !== 'title').map((field) => <section className="panel editor-section" key={field.key}><h3>{field.label}</h3><textarea className="textarea editor" value={form[field.key] as string} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} aria-label={field.label} data-testid={`input-record-${field.key}`}/></section>)}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><span className="status-note">Last updated {dateLabel(record.updatedAt)}</span><button className="button primary" type="submit" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save changes'}</button></div>
    </form>
    <aside className="side-stack">
      <section className="panel panel-pad"><div className="panel-heading"><div><div className="section-label">Files</div><h2 className="panel-title" style={{ marginTop: 6 }}>Attachments</h2><div className="row-caption">Select multiple files or paste an image anywhere in this record.</div></div><label className="icon-button" title="Add one or more attachments" style={{ cursor: busyUpload ? 'wait' : 'pointer' }}><input type="file" hidden multiple disabled={busyUpload} onChange={(e) => { void uploadFiles(Array.from(e.currentTarget.files ?? [])); e.currentTarget.value = ''; }} data-testid="input-attachment"/>{busyUpload ? <LoaderCircle size={16} className="animate-spin"/> : <Plus size={16}/>}</label></div>
        {uploadError && <div className="inline-error">{uploadError}</div>}
        {attachmentQuery.isLoading ? <div className="skeleton" style={{ height: 42 }}/> : attachmentQuery.isError ? <div className="status-note">Attachments are unavailable. <button className="button ghost" onClick={() => attachmentQuery.refetch()}>Retry</button></div> : !(attachmentQuery.data ?? record.attachments).length ? <div className="status-note">No files attached to this record.</div> : (attachmentQuery.data ?? record.attachments).map((file) => {
          const fileUrl = new URL(`/api/storage${file.objectPath}`, window.location.origin).toString();
          const isImage = file.contentType.startsWith('image/');
          return <div className="attachment-item" key={file.id} data-testid={`attachment-${file.id}`}>
            {isImage && <a href={fileUrl} target="_blank" rel="noreferrer" className="attachment-image-link" aria-label={`Open image ${file.fileName}`}><img className="attachment-preview" src={fileUrl} alt={file.fileName} loading="lazy"/></a>}
            <div className="attachment-row"><FileText size={16} color="hsl(var(--secondary-foreground))"/><div style={{ flex: 1, minWidth: 0 }}><div className="row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.fileName}</div><div className="row-caption">{(file.size / 1024).toFixed(1)} KB · {file.uploadedBy}</div></div></div>
            <div className="attachment-actions"><a href={fileUrl} target="_blank" rel="noreferrer" data-testid={`link-open-attachment-${file.id}`}>Open</a><a href={fileUrl} download={file.fileName} data-testid={`link-download-attachment-${file.id}`}>Download</a></div>
          </div>;
        })}
      </section>
      <section className="panel panel-pad"><div className="panel-heading"><div><div className="section-label">Discussion</div><h2 className="panel-title" style={{ marginTop: 6 }}>Comments</h2></div><span className="pill">{record.comments.length}</span></div>
        {!record.comments.length && <div className="status-note" style={{ marginBottom: 10 }}>Comments stay attached to this experiment.</div>}
        {record.comments.map((item) => <article className="comment" key={item.id} data-testid={`comment-${item.id}`}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 9 }}><span className="row-title">{item.authorName}</span><span className="pill">{item.authorRole}</span></div><div className="comment-meta">{dateLabel(item.createdAt)}</div><p className="comment-body">{item.body}</p></article>)}
        <form onSubmit={submitComment} style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: 13 }}><div className="field"><label htmlFor="comment-body">Add a comment</label><textarea id="comment-body" className="textarea" maxLength={3000} required value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share a note for the project team…" data-testid="input-comment"/></div><button className="button primary" style={{ width: '100%', marginTop: 10 }} disabled={addComment.isPending}>{addComment.isPending ? 'Adding…' : <><MessageSquare size={14}/> Add comment</>}</button></form>
      </section>
      <section className="panel panel-pad"><div className="section-label">Record actions</div><div className="status-note" style={{ margin: '9px 0 15px' }}>Deleting this record also removes attached files and discussion.</div><button className="button danger" style={{ width: '100%' }} onClick={() => { if (window.confirm('Delete this experiment record? Its attached files and discussion will also be removed. This cannot be undone.')) remove.mutate({ experimentId: id }, { onSuccess: async () => { await invalidateExperiment(); setLocation(`/projects/${record.projectId}`); }, onError: () => inform('Experiment could not be deleted.') }); }} disabled={remove.isPending} data-testid="button-delete-experiment">{remove.isPending ? 'Deleting…' : 'Delete experiment'}</button>{remove.isError && <div className="inline-error">Could not delete this record.</div>}</section>
    </aside></div>
    {aiOpen && <Modal title="Organize rough notes" onClose={() => setAiOpen(false)} kicker="SETUP REQUIRED"><p className="status-note" style={{ margin: '-10px 0 18px' }}>The organizer requires an OpenAI API key configured in project Secrets. This notebook does not collect keys in the interface. Any suggested draft stays separate until you review and explicitly apply it.</p>{!suggestion ? <form onSubmit={requestSuggestion}><div className="field"><label htmlFor="rough-notes">Rough notes <span className="status-note">At least 10 characters</span></label><textarea id="rough-notes" className="textarea editor" minLength={10} maxLength={12000} required value={roughNotes} onChange={(e) => setRoughNotes(e.target.value)} data-testid="input-rough-notes"/></div><div className="field" style={{ marginTop: 15 }}><label htmlFor="rough-code">Optional code or data</label><textarea id="rough-code" className="textarea" maxLength={12000} value={roughCode} onChange={(e) => setRoughCode(e.target.value)} data-testid="input-rough-code"/></div>{organizeError && <div className="inline-error" role="alert">{organizeError}</div>}<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}><button type="button" className="button" onClick={() => setAiOpen(false)}>Cancel</button><button className="button primary" disabled={organize.isPending}>{organize.isPending ? 'Preparing draft…' : <><Sparkles size={14}/> Try organizer</>}</button></div></form> : <div><div style={{ maxHeight: '48vh', overflow: 'auto' }}>{noteFields.map((field) => <div className="field" key={field.key} style={{ borderTop: '1px solid hsl(var(--border))', padding: '12px 0' }}><label className="section-label" htmlFor={`suggestion-${field.key}`}>{field.label}</label><textarea id={`suggestion-${field.key}`} className="textarea" value={suggestion[field.key]} onChange={(e) => setSuggestion({ ...suggestion, [field.key]: e.target.value })} aria-label={`Suggested ${field.label}`}/></div>)}</div><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12 }}><button className="button" onClick={() => setSuggestion(null)}>Edit rough notes</button><button className="button primary" onClick={applySuggestion} data-testid="button-apply-suggestion"><Check size={14}/> Apply draft</button></div></div>}</Modal>}
    <Toast notice={notice}/>
  </div>;
}

function InvitationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || '';
  const query = useGetProjectInvite(token);
  const accept = useAcceptProjectInvite();
  const cache = useQueryClient();
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState('');
  function acceptInvite() {
    accept.mutate({ token }, { onSuccess: async (project) => { await Promise.all([cache.invalidateQueries({ queryKey: getGetProjectInviteQueryKey(token) }), cache.invalidateQueries({ queryKey: getListProjectsQueryKey() }), cache.invalidateQueries({ queryKey: getGetNotebookOverviewQueryKey() })]); setMessage('Invitation accepted.'); setLocation(`/projects/${project.id}`); }, onError: () => setMessage('This invitation could not be accepted. It may have expired or already been used.') });
  }
  return <div className="landing grain"><header className="landing-nav"><Link href="/"><Brand/></Link><Link href="/sign-in" className="button">Sign in <ArrowRight size={14}/></Link></header><main style={{ minHeight: '68vh', display: 'grid', placeItems: 'center', padding: 20 }}><section className="panel panel-pad" style={{ width: 'min(520px,100%)', padding: 30 }}>
    <div className="eyebrow">Shared project invitation</div>{query.isLoading ? <div style={{ padding: '28px 0' }}><div className="skeleton" style={{ width: '68%', height: 22, marginBottom: 13 }}/><div className="skeleton" style={{ width: '90%', height: 13 }}/></div> : query.isError || !query.data ? <><h1 className="page-title" style={{ fontSize: 35 }}>Invitation unavailable</h1><p className="page-subtitle">This invitation could not be loaded. Ask the sender for a current project link.</p><button className="button" onClick={() => query.refetch()}>Try again</button></> : <><h1 className="page-title" style={{ fontSize: 39, marginTop: 13 }}>{query.data.projectTitle}</h1><p className="page-subtitle">You are invited by {query.data.inviterName} to join this {query.data.discipline} project as a {query.data.role}.</p><div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '22px 0' }}><span className="pill">{query.data.role}</span><span className="status-note">Invitation expires {dateLabel(query.data.expiresAt)}</span></div><Show when="signed-in"><button className="button primary" style={{ width: '100%' }} onClick={acceptInvite} disabled={accept.isPending} data-testid="button-accept-invite">{accept.isPending ? 'Joining project…' : <>Accept invitation <ArrowRight size={15}/></>}</button></Show><Show when="signed-out"><p className="status-note" style={{ marginBottom: 10 }}>Sign in with the account invited to this project to continue.</p><Link className="button primary" style={{ width: '100%' }} href={`/sign-in?redirect_url=${encodeURIComponent(`${window.location.origin}${basePath}/invite/${token}`)}`}>Sign in to accept <ArrowRight size={15}/></Link></Show>{message && <div className="inline-error">{message}</div>}</>}</section></main><footer className="landing-footer"><span>Fieldnotes · Academic Lab Notebook</span><span>For scholars and their guides</span></footer></div>;
}
function AuthenticatedDashboard() { return <Protected><DashboardPage/></Protected>; }
function AuthenticatedProjects() { return <Protected><ProjectsPage/></Protected>; }
function AuthenticatedProject() { return <Protected><ProjectDetailPage/></Protected>; }
function AuthenticatedExperiment() { return <Protected><ExperimentPage/></Protected>; }
function HomeRedirect() { return <PublicHome/>; }
function RouterRoutes() {
  return <Switch>
    <Route path="/" component={HomeRedirect}/>
    <Route path="/sign-in/*?" component={SignInPage}/>
    <Route path="/sign-up/*?" component={SignUpPage}/>
    <Route path="/dashboard" component={AuthenticatedDashboard}/>
    <Route path="/projects" component={AuthenticatedProjects}/>
    <Route path="/projects/:projectId" component={AuthenticatedProject}/>
    <Route path="/experiments/:experimentId" component={AuthenticatedExperiment}/>
    <Route path="/invite/:token" component={InvitationPage}/>
    <Route component={NotFound}/>
  </Switch>;
}
function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Return to your research workbench' } },
      signUp: { start: { title: 'Begin your notebook', subtitle: 'Make room for careful research' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkCacheInvalidator/><RouterRoutes/></QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkRoutes/></WouterRouter>;
}
export default App;
