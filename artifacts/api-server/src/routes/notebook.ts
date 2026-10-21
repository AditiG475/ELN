import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import {
  AcceptProjectInviteParams,
  AddExperimentCommentBody,
  AddExperimentCommentParams,
  CreateExperimentBody,
  CreateExperimentParams,
  CreateProjectBody,
  CreateProjectInviteBody,
  CreateProjectInviteParams,
  DeleteExperimentParams,
  GetExperimentParams,
  GetProjectInviteParams,
  GetProjectParams,
  UpdateExperimentBody,
  UpdateExperimentParams,
  UpdateProjectBody,
  UpdateProjectParams,
} from "@workspace/api-zod";
import {
  db,
  experimentsTable,
  experimentAttachmentsTable,
  experimentCommentsTable,
  projectInvitesTable,
  projectMembersTable,
  projectsTable,
} from "@workspace/db";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
} from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

type Actor = {
  id: string;
  name: string;
  email: string;
};

function getActor(req: Request): Actor | null {
  const auth = getAuth(req);
  if (!auth.userId) return null;

  const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
  const first = typeof claims.given_name === "string" ? claims.given_name : "";
  const last = typeof claims.family_name === "string" ? claims.family_name : "";
  const claimName = typeof claims.name === "string" ? claims.name : "";
  const email = typeof claims.email === "string" ? claims.email : "";

  return {
    id: auth.userId,
    name: `${first} ${last}`.trim() || claimName || "Researcher",
    email,
  };
}

function numberParam(value: string | string[] | undefined): number | null {
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] ?? "" : value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function iso(value: Date): string {
  return value.toISOString();
}

function dateValue(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

async function getMembership(projectId: number, userId: string) {
  const rows = await db
    .select()
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.projectId, projectId),
        eq(projectMembersTable.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getProject(projectId: number) {
  const rows = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function totalForProject(projectId: number, table: "members" | "experiments") {
  const rows =
    table === "members"
      ? await db
          .select({ total: count() })
          .from(projectMembersTable)
          .where(eq(projectMembersTable.projectId, projectId))
      : await db
          .select({ total: count() })
          .from(experimentsTable)
          .where(eq(experimentsTable.projectId, projectId));
  return Number(rows[0]?.total ?? 0);
}

async function toProject(projectId: number, role: string) {
  const project = await getProject(projectId);
  if (!project) return null;
  const [memberCount, experimentCount] = await Promise.all([
    totalForProject(projectId, "members"),
    totalForProject(projectId, "experiments"),
  ]);
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    discipline: project.discipline,
    status: project.status,
    role,
    memberCount,
    experimentCount,
    updatedAt: iso(project.updatedAt),
  };
}

async function toExperiment(experiment: typeof experimentsTable.$inferSelect) {
  const [attachments, comments] = await Promise.all([
    db
      .select({ total: count() })
      .from(experimentAttachmentsTable)
      .where(eq(experimentAttachmentsTable.experimentId, experiment.id)),
    db
      .select({ total: count() })
      .from(experimentCommentsTable)
      .where(eq(experimentCommentsTable.experimentId, experiment.id)),
  ]);
  return {
    id: experiment.id,
    projectId: experiment.projectId,
    title: experiment.title,
    status: experiment.status,
    experimentDate: experiment.experimentDate,
    hypothesis: experiment.hypothesis,
    materials: experiment.materials,
    protocol: experiment.protocol,
    observations: experiment.observations,
    results: experiment.results,
    conclusion: experiment.conclusion,
    authorName: experiment.authorName,
    createdAt: iso(experiment.createdAt),
    updatedAt: iso(experiment.updatedAt),
    attachmentCount: Number(attachments[0]?.total ?? 0),
    commentCount: Number(comments[0]?.total ?? 0),
  };
}

function unauthorized(res: Response) {
  res.status(401).json({ error: "Sign in to access your notebook." });
}

router.get("/notebook/overview", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);

  const memberships = await db
    .select()
    .from(projectMembersTable)
    .where(eq(projectMembersTable.userId, actor.id));
  const projects = await Promise.all(
    memberships.map((membership) => toProject(membership.projectId, membership.role)),
  );
  const projectIds = memberships.map((membership) => membership.projectId);

  if (projectIds.length === 0) {
    return res.json({
      activeProjects: 0,
      experimentsThisWeek: 0,
      awaitingReview: 0,
      recentExperiments: [],
      projects: [],
    });
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  weekStart.setUTCHours(0, 0, 0, 0);
  const [experiments, weeklyCount, completedCount] = await Promise.all([
    db
      .select()
      .from(experimentsTable)
      .where(inArray(experimentsTable.projectId, projectIds))
      .orderBy(desc(experimentsTable.updatedAt))
      .limit(6),
    db
      .select({ total: count() })
      .from(experimentsTable)
      .where(
        and(
          inArray(experimentsTable.projectId, projectIds),
          gte(experimentsTable.updatedAt, weekStart),
        ),
      ),
    db
      .select({ total: count() })
      .from(experimentsTable)
      .where(
        and(
          inArray(experimentsTable.projectId, projectIds),
          eq(experimentsTable.status, "complete"),
        ),
      ),
  ]);
  const projectById = new Map(
    (projects.filter(Boolean) as NonNullable<(typeof projects)[number]>[]).map((project) => [
      project.id,
      project.title,
    ]),
  );

  return res.json({
    activeProjects: projects.filter((project) => project?.status === "active").length,
    experimentsThisWeek: Number(weeklyCount[0]?.total ?? 0),
    awaitingReview: Number(completedCount[0]?.total ?? 0),
    recentExperiments: experiments.slice(0, 6).map((experiment) => ({
      id: experiment.id,
      projectId: experiment.projectId,
      projectTitle: projectById.get(experiment.projectId) ?? "Research project",
      title: experiment.title,
      status: experiment.status,
      authorName: experiment.authorName,
      updatedAt: iso(experiment.updatedAt),
    })),
    projects: projects.filter(Boolean),
  });
});

router.get("/notebook/projects", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const memberships = await db
    .select()
    .from(projectMembersTable)
    .where(eq(projectMembersTable.userId, actor.id));
  const projects = await Promise.all(
    memberships.map((membership) => toProject(membership.projectId, membership.role)),
  );
  return res.json(projects.filter(Boolean));
});

router.post("/notebook/projects", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the project details and try again." });

  const [project] = await db
    .insert(projectsTable)
    .values({
      title: parsed.data.title.trim(),
      description: parsed.data.description ?? "",
      discipline: parsed.data.discipline.trim(),
      createdBy: actor.id,
    })
    .returning();
  await db.insert(projectMembersTable).values({
    projectId: project.id,
    userId: actor.id,
    name: actor.name,
    email: actor.email,
    role: parsed.data.role,
  });
  return res.status(201).json(await toProject(project.id, parsed.data.role));
});

router.get("/notebook/projects/:projectId", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const params = GetProjectParams.safeParse({ projectId: req.params.projectId });
  const projectId = params.success ? params.data.projectId : numberParam(req.params.projectId);
  if (!projectId) return res.status(400).json({ error: "Invalid project." });
  const membership = await getMembership(projectId, actor.id);
  if (!membership) return res.status(404).json({ error: "Project not found." });
  const project = await toProject(projectId, membership.role);
  if (!project) return res.status(404).json({ error: "Project not found." });

  const [members, experiments] = await Promise.all([
    db.select().from(projectMembersTable).where(eq(projectMembersTable.projectId, projectId)),
    db
      .select()
      .from(experimentsTable)
      .where(eq(experimentsTable.projectId, projectId))
      .orderBy(desc(experimentsTable.updatedAt)),
  ]);
  return res.json({
    ...project,
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      joinedAt: iso(member.joinedAt),
    })),
    experiments: await Promise.all(experiments.map(toExperiment)),
  });
});

router.patch("/notebook/projects/:projectId", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const params = UpdateProjectParams.safeParse({ projectId: req.params.projectId });
  const projectId = params.success ? params.data.projectId : numberParam(req.params.projectId);
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!projectId || !parsed.success) return res.status(400).json({ error: "Invalid project update." });
  const membership = await getMembership(projectId, actor.id);
  if (!membership) return res.status(404).json({ error: "Project not found." });
  if (membership.role !== "guide") return res.status(403).json({ error: "Only a project guide can change project details." });
  const [updated] = await db
    .update(projectsTable)
    .set(parsed.data)
    .where(eq(projectsTable.id, projectId))
    .returning();
  return res.json(await toProject(updated.id, membership.role));
});

router.post("/notebook/projects/:projectId/experiments", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const params = CreateExperimentParams.safeParse({ projectId: req.params.projectId });
  const projectId = params.success ? params.data.projectId : numberParam(req.params.projectId);
  const parsed = CreateExperimentBody.safeParse(req.body);
  if (!projectId || !parsed.success) return res.status(400).json({ error: "Check the experiment details and try again." });
  if (!(await getMembership(projectId, actor.id))) return res.status(404).json({ error: "Project not found." });

  const [experiment] = await db
    .insert(experimentsTable)
    .values({
      projectId,
      title: parsed.data.title.trim(),
      status: parsed.data.status ?? "planned",
      experimentDate: dateValue(parsed.data.experimentDate),
      hypothesis: parsed.data.hypothesis ?? "",
      materials: parsed.data.materials ?? "",
      protocol: parsed.data.protocol ?? "",
      observations: parsed.data.observations ?? "",
      results: parsed.data.results ?? "",
      conclusion: parsed.data.conclusion ?? "",
      authorId: actor.id,
      authorName: actor.name,
    })
    .returning();
  return res.status(201).json(await toExperiment(experiment));
});

router.get("/notebook/experiments/:experimentId", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const params = GetExperimentParams.safeParse({ experimentId: req.params.experimentId });
  const experimentId = params.success ? params.data.experimentId : numberParam(req.params.experimentId);
  if (!experimentId) return res.status(400).json({ error: "Invalid experiment." });
  const [experiment] = await db
    .select()
    .from(experimentsTable)
    .where(eq(experimentsTable.id, experimentId))
    .limit(1);
  if (!experiment || !(await getMembership(experiment.projectId, actor.id))) {
    return res.status(404).json({ error: "Experiment not found." });
  }
  const [attachments, comments] = await Promise.all([
    db
      .select()
      .from(experimentAttachmentsTable)
      .where(eq(experimentAttachmentsTable.experimentId, experimentId))
      .orderBy(desc(experimentAttachmentsTable.createdAt)),
    db
      .select()
      .from(experimentCommentsTable)
      .where(eq(experimentCommentsTable.experimentId, experimentId))
      .orderBy(desc(experimentCommentsTable.createdAt)),
  ]);
  return res.json({
    ...(await toExperiment(experiment)),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      experimentId: attachment.experimentId,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      objectPath: attachment.objectPath,
      uploadedBy: attachment.uploadedBy,
      createdAt: iso(attachment.createdAt),
    })),
    comments: comments.map((comment) => ({
      id: comment.id,
      experimentId: comment.experimentId,
      body: comment.body,
      authorName: comment.authorName,
      authorRole: comment.authorRole,
      createdAt: iso(comment.createdAt),
    })),
  });
});

router.patch("/notebook/experiments/:experimentId", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const params = UpdateExperimentParams.safeParse({ experimentId: req.params.experimentId });
  const experimentId = params.success ? params.data.experimentId : numberParam(req.params.experimentId);
  const parsed = UpdateExperimentBody.safeParse(req.body);
  if (!experimentId || !parsed.success) return res.status(400).json({ error: "Invalid experiment update." });
  const [existing] = await db.select().from(experimentsTable).where(eq(experimentsTable.id, experimentId)).limit(1);
  if (!existing || !(await getMembership(existing.projectId, actor.id))) {
    return res.status(404).json({ error: "Experiment not found." });
  }
  const { experimentDate, ...fields } = parsed.data;
  const [updated] = await db
    .update(experimentsTable)
    .set({
      ...fields,
      ...(experimentDate ? { experimentDate: dateValue(experimentDate) } : {}),
    })
    .where(eq(experimentsTable.id, experimentId))
    .returning();
  return res.json(await toExperiment(updated));
});

router.delete("/notebook/experiments/:experimentId", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const params = DeleteExperimentParams.safeParse({ experimentId: req.params.experimentId });
  const experimentId = params.success ? params.data.experimentId : numberParam(req.params.experimentId);
  if (!experimentId) return res.status(400).json({ error: "Invalid experiment." });
  const [existing] = await db.select().from(experimentsTable).where(eq(experimentsTable.id, experimentId)).limit(1);
  if (!existing) return res.status(404).json({ error: "Experiment not found." });
  const membership = await getMembership(existing.projectId, actor.id);
  if (!membership) return res.status(404).json({ error: "Experiment not found." });
  if (existing.authorId !== actor.id && membership.role !== "guide") {
    return res.status(403).json({ error: "Only the author or a project guide can delete this experiment." });
  }
  const attachments = await db
    .select()
    .from(experimentAttachmentsTable)
    .where(eq(experimentAttachmentsTable.experimentId, experimentId));
  for (const attachment of attachments) {
    const file = await objectStorage.getObjectEntityFile(attachment.objectPath);
    await file.delete({ ignoreNotFound: true });
  }
  await db.delete(experimentsTable).where(eq(experimentsTable.id, experimentId));
  return res.status(204).end();
});

router.post("/notebook/experiments/:experimentId/comments", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const params = AddExperimentCommentParams.safeParse({ experimentId: req.params.experimentId });
  const experimentId = params.success ? params.data.experimentId : numberParam(req.params.experimentId);
  const parsed = AddExperimentCommentBody.safeParse(req.body);
  if (!experimentId || !parsed.success) return res.status(400).json({ error: "Write a comment before posting." });
  const [experiment] = await db.select().from(experimentsTable).where(eq(experimentsTable.id, experimentId)).limit(1);
  if (!experiment) return res.status(404).json({ error: "Experiment not found." });
  const membership = await getMembership(experiment.projectId, actor.id);
  if (!membership) return res.status(404).json({ error: "Experiment not found." });
  const [comment] = await db
    .insert(experimentCommentsTable)
    .values({
      experimentId,
      body: parsed.data.body.trim(),
      authorId: actor.id,
      authorName: actor.name,
      authorRole: membership.role,
    })
    .returning();
  return res.status(201).json({
    id: comment.id,
    experimentId: comment.experimentId,
    body: comment.body,
    authorName: comment.authorName,
    authorRole: comment.authorRole,
    createdAt: iso(comment.createdAt),
  });
});

router.post("/notebook/projects/:projectId/invites", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const params = CreateProjectInviteParams.safeParse({ projectId: req.params.projectId });
  const projectId = params.success ? params.data.projectId : numberParam(req.params.projectId);
  const parsed = CreateProjectInviteBody.safeParse(req.body);
  if (!projectId || !parsed.success) return res.status(400).json({ error: "Enter a valid email and role." });
  const membership = await getMembership(projectId, actor.id);
  if (!membership) return res.status(404).json({ error: "Project not found." });
  if (parsed.data.role === "guide" && membership.role !== "guide") {
    return res.status(403).json({ error: "Only a project guide can invite another guide." });
  }
  const project = await getProject(projectId);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(projectInvitesTable).values({
    projectId,
    token,
    email: parsed.data.email.toLowerCase().trim(),
    role: parsed.data.role,
    createdBy: actor.id,
    inviterName: actor.name,
    expiresAt,
  });
  return res.status(201).json({
    token,
    role: parsed.data.role,
    inviteUrl: `/invite/${token}`,
    expiresAt: iso(expiresAt),
  });
});

router.get("/notebook/invitations/:token", async (req, res) => {
  const params = GetProjectInviteParams.safeParse({ token: req.params.token });
  if (!params.success) return res.status(404).json({ error: "Invitation not found or expired." });
  const [invite] = await db
    .select()
    .from(projectInvitesTable)
    .where(eq(projectInvitesTable.token, params.data.token))
    .limit(1);
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return res.status(404).json({ error: "Invitation not found or expired." });
  }
  const project = await getProject(invite.projectId);
  if (!project) return res.status(404).json({ error: "Invitation not found or expired." });
  return res.json({
    projectTitle: project.title,
    discipline: project.discipline,
    inviterName: invite.inviterName,
    role: invite.role,
    expiresAt: iso(invite.expiresAt),
  });
});

router.post("/notebook/invitations/:token", async (req, res) => {
  const actor = getActor(req);
  if (!actor) return unauthorized(res);
  const params = AcceptProjectInviteParams.safeParse({ token: req.params.token });
  if (!params.success) return res.status(404).json({ error: "Invitation not found or expired." });
  const [invite] = await db
    .select()
    .from(projectInvitesTable)
    .where(eq(projectInvitesTable.token, params.data.token))
    .limit(1);
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return res.status(404).json({ error: "Invitation not found or expired." });
  }
  const alreadyMember = await getMembership(invite.projectId, actor.id);
  if (!alreadyMember) {
    await db.insert(projectMembersTable).values({
      projectId: invite.projectId,
      userId: actor.id,
      name: actor.name,
      email: actor.email || invite.email,
      role: invite.role,
    });
  }
  await db
    .update(projectInvitesTable)
    .set({ acceptedAt: new Date() })
    .where(and(eq(projectInvitesTable.id, invite.id), isNull(projectInvitesTable.acceptedAt)));
  return res.json(await toProject(invite.projectId, alreadyMember?.role ?? invite.role));
});

export default router;
