import { Readable } from "node:stream";
import { getAuth } from "@clerk/express";
import {
  AddExperimentAttachmentBody,
  AddExperimentAttachmentParams,
  AddExperimentAttachmentResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import {
  db,
  experimentsTable,
  experimentAttachmentsTable,
  projectMembersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function userIdFor(req: Request) {
  return getAuth(req).userId;
}

router.post("/storage/uploads/request-url", async (req, res) => {
  if (!userIdFor(req)) return res.status(401).json({ error: "Sign in to upload a file." });
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid upload details." });
  const { name, size, contentType } = parsed.data;
  if (size > MAX_ATTACHMENT_BYTES) {
    return res.status(413).json({ error: "Files must be 20 MB or smaller." });
  }
  const supported =
    contentType.startsWith("image/") ||
    contentType.startsWith("text/") ||
    contentType === "application/pdf" ||
    contentType === "application/json" ||
    contentType === "application/octet-stream";
  if (!supported) {
    return res.status(415).json({ error: "Upload an image, code/text file, JSON file, or PDF." });
  }

  const uploadURL = await objectStorage.getObjectEntityUploadURL();
  const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
  return res.json(
    RequestUploadUrlResponse.parse({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType },
    }),
  );
});

router.get("/storage/objects/*path", async (req, res) => {
  const userId = userIdFor(req);
  if (!userId) return res.status(401).json({ error: "Sign in to view this attachment." });

  const raw = req.params.path;
  const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
  const objectPath = `/objects/${wildcardPath}`;
  const [attachment] = await db
    .select()
    .from(experimentAttachmentsTable)
    .where(eq(experimentAttachmentsTable.objectPath, objectPath))
    .limit(1);
  if (!attachment) return res.status(404).json({ error: "Attachment not found." });

  const [experiment] = await db
    .select()
    .from(experimentsTable)
    .where(eq(experimentsTable.id, attachment.experimentId))
    .limit(1);
  if (!experiment) return res.status(404).json({ error: "Attachment not found." });
  const [membership] = await db
    .select({ id: projectMembersTable.id })
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.projectId, experiment.projectId),
        eq(projectMembersTable.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) return res.status(404).json({ error: "Attachment not found." });

  try {
    const file = await objectStorage.getObjectEntityFile(objectPath);
    const response = await objectStorage.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`);
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      return;
    } else {
      res.end();
      return;
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "Attachment not found." });
    }
    req.log.error({ err: error }, "Failed to serve notebook attachment");
    return res.status(500).json({ error: "Failed to load attachment." });
  }
});

router.post("/notebook/experiments/:experimentId/attachments", async (req, res) => {
  const userId = userIdFor(req);
  if (!userId) return res.status(401).json({ error: "Sign in to attach a file." });

  const experimentId = Number.parseInt(req.params.experimentId ?? "", 10);
  const params = AddExperimentAttachmentParams.safeParse({ experimentId });
  const parsed = AddExperimentAttachmentBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    return res.status(400).json({ error: "Invalid attachment details." });
  }
  const [experiment] = await db
    .select()
    .from(experimentsTable)
    .where(eq(experimentsTable.id, experimentId))
    .limit(1);
  if (!experiment) return res.status(404).json({ error: "Experiment not found." });
  const [membership] = await db
    .select({ id: projectMembersTable.id })
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.projectId, experiment.projectId),
        eq(projectMembersTable.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) return res.status(404).json({ error: "Experiment not found." });

  const [attachment] = await db
    .insert(experimentAttachmentsTable)
    .values({
      experimentId,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      size: parsed.data.size,
      objectPath: parsed.data.objectPath,
      uploadedBy: userId,
    })
    .returning();
  return res.status(201).json(
    AddExperimentAttachmentResponse.parse({
      id: attachment.id,
      experimentId: attachment.experimentId,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      objectPath: attachment.objectPath,
      uploadedBy: attachment.uploadedBy,
      createdAt: attachment.createdAt.toISOString(),
    }),
  );
});

router.get("/notebook/experiments/:experimentId/attachments", async (req, res) => {
  const userId = userIdFor(req);
  if (!userId) return res.status(401).json({ error: "Sign in to view attachments." });
  const experimentId = Number.parseInt(req.params.experimentId ?? "", 10);
  const [experiment] = await db
    .select()
    .from(experimentsTable)
    .where(eq(experimentsTable.id, experimentId))
    .limit(1);
  if (!experiment) return res.status(404).json({ error: "Experiment not found." });
  const [membership] = await db
    .select({ id: projectMembersTable.id })
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.projectId, experiment.projectId),
        eq(projectMembersTable.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) return res.status(404).json({ error: "Experiment not found." });
  const attachments = await db
    .select()
    .from(experimentAttachmentsTable)
    .where(eq(experimentAttachmentsTable.experimentId, experimentId));
  return res.json(
    attachments.map((attachment) => ({
      id: attachment.id,
      experimentId: attachment.experimentId,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      objectPath: attachment.objectPath,
      uploadedBy: attachment.uploadedBy,
      createdAt: attachment.createdAt.toISOString(),
    })),
  );
});

export default router;
