import Dexie, { type EntityTable } from 'dexie';
import type { Scene, SceneType, SceneContent, Whiteboard } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type {
  SessionType,
  SessionStatus,
  SessionConfig,
  ToolCallRecord,
  ToolCallRequest,
} from '@/lib/types/chat';
import type { SceneOutline } from '@/lib/types/generation';
import type { UIMessage } from 'ai';
import { createLogger } from '@/lib/logger';
import type { ProtocolMessageEnvelope } from '@/lib/types/agent-chat-protocol';

const log = createLogger('Database');

/**
 * Legacy Snapshot type for undo/redo functionality
 * Used by useSnapshotStore
 */
export interface Snapshot {
  id?: number;
  index: number;
  slides: Scene[];
}

/**
 * MAIC Local Database
 *
 * Uses IndexedDB to store all user data locally
 * - Does not delete expired data; all data is stored permanently
 * - Uses a fixed database name
 * - Supports multi-course management
 */

// ==================== Database Table Type Definitions ====================

/** 课程容器：其下可包含多个笔记本（原 Stage 一条记录 = 一个笔记本） */
export type CoursePurpose = 'research' | 'university' | 'daily';

export interface CourseRecord {
  id: string;
  name: string;
  description?: string;
  language: 'zh-CN' | 'en-US';
  tags: string[];
  purpose: CoursePurpose;
  /** 用途为大学课程时可选 */
  university?: string;
  courseCode?: string;
  /** 课程头像，如 `/avatars/notebook-agents/xxx.avif` */
  avatarUrl?: string;
  /** 是否在课程商城对其他人可见（仅服务端课程） */
  listedInCourseStore?: boolean;
  coursePriceCents?: number;
  storePublishedAt?: number | string;
  sourceCourseId?: string;
  createdAt: number;
  updatedAt: number;
}

/** 课程商城「社区」列表项（含创作者与笔记本数量） */
export type CommunityCourseListItem = CourseRecord & {
  ownerName: string;
  notebookCount: number;
  averageRating?: number;
  reviewCount?: number;
  purchased?: boolean;
};

/**
 * Stage table — 一个 Stage = 一门课程下的一个「笔记本」（互动课件）
 */
export interface StageRecord {
  id: string; // Primary key
  /** 所属课程（Course） */
  courseId?: string;
  /** 笔记本头像 */
  avatarUrl?: string;
  name: string;
  description?: string;
  tags?: string[];
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
  language?: string;
  style?: string;
  currentSceneId?: string;
}

/**
 * Scene table - Scene/page data
 */
export interface SceneRecord {
  id: string; // Primary key
  stageId: string; // Foreign key -> stages.id
  type: SceneType;
  title: string;
  order: number; // Display order
  content: SceneContent; // Stored as JSON
  actions?: Action[]; // Stored as JSON
  whiteboard?: Whiteboard[]; // Stored as JSON
  createdAt: number;
  updatedAt: number;
}

/**
 * AudioFile table - Audio files (TTS)
 */
export interface AudioFileRecord {
  id: string; // Primary key (audioId)
  blob: Blob; // Audio binary data
  duration?: number; // Duration (seconds)
  format: string; // mp3, wav, etc.
  text?: string; // Corresponding text content
  voice?: string; // Voice used
  createdAt: number;
  ossKey?: string; // Full CDN URL for this audio blob
}

/**
 * ImageFile table - Image files
 */
export interface ImageFileRecord {
  id: string; // Primary key
  blob: Blob; // Image binary data
  filename: string; // Original filename
  mimeType: string; // image/png, image/jpeg, etc.
  size: number; // File size (bytes)
  createdAt: number;
}

/**
 * ChatSession table - Chat session data
 */
export interface ChatSessionRecord {
  id: string; // PK (session id)
  stageId: string; // FK -> stages.id
  type: SessionType;
  title: string;
  status: SessionStatus;
  messages: UIMessage[]; // JSON-safe serialized messages
  config: SessionConfig;
  toolCalls: ToolCallRecord[];
  pendingToolCalls: ToolCallRequest[];
  createdAt: number;
  updatedAt: number;
  sceneId?: string;
  lastActionIndex?: number;
}

/**
 * ContactConversation table - course-level chat timelines
 * Used by /chat (notebook + course-agent contacts)
 */
export type ContactConversationKind = 'notebook' | 'agent';

export interface ContactConversationRecord {
  /** PK: `${kind}:${targetId}` */
  id: string;
  courseId: string;
  kind: ContactConversationKind;
  targetId: string;
  targetName: string;
  /** JSON-safe message array; exact shape depends on contact kind */
  messages: unknown[];
  createdAt: number;
  updatedAt: number;
}

export type AgentTaskStatus = 'running' | 'waiting' | 'done' | 'failed';
export type AgentTaskContactKind = 'notebook' | 'agent';

export interface AgentTaskRecord {
  id: string;
  courseId: string;
  /** 与互动教室 `/classroom/[id]`、Prisma `AgentTask.notebookId` 一致 */
  notebookId?: string;
  parentTaskId?: string;
  contactKind: AgentTaskContactKind;
  contactId: string;
  status: AgentTaskStatus;
  title: string;
  detail?: string;
  lastEnvelope?: ProtocolMessageEnvelope;
  createdAt: number;
  updatedAt: number;
}

/**
 * PlaybackState table - Playback state snapshot (at most one per stage)
 */
export interface PlaybackStateRecord {
  stageId: string; // PK
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  updatedAt: number;
}

/**
 * StageOutlines table - Persisted outlines for resume-on-refresh
 */
export interface StageOutlinesRecord {
  stageId: string; // Primary key (FK -> stages.id)
  outlines: SceneOutline[];
  createdAt: number;
  updatedAt: number;
}

/**
 * MediaFile table - AI-generated media files (images/videos)
 */
export interface MediaFileRecord {
  id: string; // Compound key: `${stageId}:${elementId}`
  stageId: string; // FK → stages.id
  type: 'image' | 'video';
  blob: Blob; // Media binary
  mimeType: string; // image/png, video/mp4
  size: number;
  poster?: Blob; // Video thumbnail blob
  prompt: string; // Original prompt (for retry)
  params: string; // JSON-serialized generation params
  error?: string; // If set, this is a failed task (blob is empty placeholder)
  errorCode?: string; // Structured error code (e.g. 'CONTENT_SENSITIVE')
  ossKey?: string; // Full CDN URL for this media blob
  posterOssKey?: string; // Full CDN URL for the poster blob
  createdAt: number;
}

/**
 * GeneratedAgent table - AI-generated agent profiles
 */
export interface GeneratedAgentRecord {
  id: string; // PK: agent ID (e.g. "gen-abc123")
  stageId: string; // FK -> stages.id
  name: string;
  role: string; // 'teacher' | 'assistant' | 'student'
  persona: string;
  avatar: string;
  color: string;
  priority: number;
  createdAt: number;
}

/** Build the compound primary key for mediaFiles: `${stageId}:${elementId}` */
export function mediaFileKey(stageId: string, elementId: string): string {
  return `${stageId}:${elementId}`;
}

// ==================== Database Definition ====================

const DATABASE_NAME = 'MAIC-Database';
const _DATABASE_VERSION = 9;

/**
 * MAIC Database Instance
 */
class MAICDatabase extends Dexie {
  // Table definitions
  courses!: EntityTable<CourseRecord, 'id'>;
  stages!: EntityTable<StageRecord, 'id'>;
  scenes!: EntityTable<SceneRecord, 'id'>;
  audioFiles!: EntityTable<AudioFileRecord, 'id'>;
  imageFiles!: EntityTable<ImageFileRecord, 'id'>;
  snapshots!: EntityTable<Snapshot, 'id'>; // Undo/redo snapshots (legacy)
  chatSessions!: EntityTable<ChatSessionRecord, 'id'>;
  playbackState!: EntityTable<PlaybackStateRecord, 'stageId'>;
  stageOutlines!: EntityTable<StageOutlinesRecord, 'stageId'>;
  mediaFiles!: EntityTable<MediaFileRecord, 'id'>;
  generatedAgents!: EntityTable<GeneratedAgentRecord, 'id'>;
  contactConversations!: EntityTable<ContactConversationRecord, 'id'>;
  agentTasks!: EntityTable<AgentTaskRecord, 'id'>;

  constructor() {
    super(DATABASE_NAME);

    // Version 1: Initial schema
    this.version(1).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      // Previously had: messages, participants, discussions, sceneSnapshots
    });

    // Version 2: Remove unused tables
    this.version(2).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      // Delete removed tables
      messages: null,
      participants: null,
      discussions: null,
      sceneSnapshots: null,
    });

    // Version 3: Add chatSessions and playbackState tables
    this.version(3).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
    });

    // Version 4: Add stageOutlines table for resume-on-refresh
    this.version(4).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
    });

    // Version 5: Add mediaFiles table for async media generation
    this.version(5).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
      mediaFiles: 'id, stageId, [stageId+type]',
    });

    // Version 6: Fix mediaFiles primary key — use compound key stageId:elementId
    // to prevent cross-course collisions (gen_img_1 is NOT globally unique)
    this.version(6)
      .stores({
        stages: 'id, updatedAt',
        scenes: 'id, stageId, order, [stageId+order]',
        audioFiles: 'id, createdAt',
        imageFiles: 'id, createdAt',
        snapshots: '++id',
        chatSessions: 'id, stageId, [stageId+createdAt]',
        playbackState: 'stageId',
        stageOutlines: 'stageId',
        mediaFiles: 'id, stageId, [stageId+type]',
      })
      .upgrade(async (tx) => {
        const table = tx.table('mediaFiles');
        const allRecords = await table.toArray();
        for (const rec of allRecords) {
          const newKey = `${rec.stageId}:${rec.id}`;
          // Skip if already migrated (idempotent)
          if (rec.id.includes(':')) continue;
          await table.delete(rec.id);
          await table.put({ ...rec, id: newKey });
        }
      });

    // Version 7: Add ossKey fields to mediaFiles and audioFiles for OSS storage plugin
    // Non-indexed optional fields — Dexie handles these transparently.
    this.version(7).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
      mediaFiles: 'id, stageId, [stageId+type]',
    });

    // Version 8: Add generatedAgents table for AI-generated agent profiles
    this.version(8).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
      mediaFiles: 'id, stageId, [stageId+type]',
      generatedAgents: 'id, stageId',
    });

    // Version 9: Courses as containers; stages (notebooks) link via courseId
    this.version(9).stores({
      courses: 'id, updatedAt',
      stages: 'id, updatedAt, courseId',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
      mediaFiles: 'id, stageId, [stageId+type]',
      generatedAgents: 'id, stageId',
    });

    // Version 10: Notebook (stage) avatarUrl — backfill stable avatar per stage id
    this.version(10)
      .stores({
        courses: 'id, updatedAt',
        stages: 'id, updatedAt, courseId',
        scenes: 'id, stageId, order, [stageId+order]',
        audioFiles: 'id, createdAt',
        imageFiles: 'id, createdAt',
        snapshots: '++id',
        chatSessions: 'id, stageId, [stageId+createdAt]',
        playbackState: 'stageId',
        stageOutlines: 'stageId',
        mediaFiles: 'id, stageId, [stageId+type]',
        generatedAgents: 'id, stageId',
      })
      .upgrade(async (tx) => {
        const { pickStableNotebookAgentAvatarUrl } =
          await import('@/lib/constants/notebook-agent-avatars');
        const table = tx.table('stages');
        const rows: Array<{ id: string; avatarUrl?: string }> = await table.toArray();
        const now = Date.now();
        for (const s of rows) {
          if (s.avatarUrl?.trim()) continue;
          await table.update(s.id, {
            avatarUrl: pickStableNotebookAgentAvatarUrl(s.id),
            updatedAt: now,
          });
        }
      });

    // Version 11: Add course-level contact conversations for /chat
    this.version(11).stores({
      courses: 'id, updatedAt',
      stages: 'id, updatedAt, courseId',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
      mediaFiles: 'id, stageId, [stageId+type]',
      generatedAgents: 'id, stageId',
      contactConversations:
        'id, courseId, kind, targetId, updatedAt, [kind+targetId], [courseId+kind], [courseId+updatedAt]',
    });

    // Version 12: Add agent task table for /chat orchestration status
    this.version(12).stores({
      courses: 'id, updatedAt',
      stages: 'id, updatedAt, courseId',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
      mediaFiles: 'id, stageId, [stageId+type]',
      generatedAgents: 'id, stageId',
      contactConversations:
        'id, courseId, kind, targetId, updatedAt, [kind+targetId], [courseId+kind], [courseId+updatedAt]',
      agentTasks:
        'id, courseId, status, contactKind, contactId, updatedAt, [courseId+status], [contactKind+contactId], [courseId+updatedAt]',
    });

    // Version 13: agentTasks parentTaskId + protocol envelope snapshot
    this.version(13).stores({
      courses: 'id, updatedAt',
      stages: 'id, updatedAt, courseId',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
      mediaFiles: 'id, stageId, [stageId+type]',
      generatedAgents: 'id, stageId',
      contactConversations:
        'id, courseId, kind, targetId, updatedAt, [kind+targetId], [courseId+kind], [courseId+updatedAt]',
      agentTasks:
        'id, courseId, parentTaskId, status, contactKind, contactId, updatedAt, [courseId+status], [contactKind+contactId], [courseId+updatedAt], [parentTaskId+updatedAt]',
    });
  }
}

// Create database instance
export const db = new MAICDatabase();

// ==================== Helper Functions ====================

/**
 * Initialize database
 * Call at application startup
 */
export async function initDatabase(): Promise<void> {
  try {
    await db.open();
    // Request persistent storage to prevent browser from evicting IndexedDB
    // under storage pressure (large media blobs can trigger LRU cleanup)
    void navigator.storage?.persist?.();
    log.info('Database initialized successfully');
  } catch (error) {
    log.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Clear database (optional)
 * Use with caution: deletes all data
 */
export async function clearDatabase(): Promise<void> {
  await db.delete();
  log.info('Database cleared');
}

/**
 * Export database contents (for backup)
 */
export async function exportDatabase(): Promise<{
  stages: StageRecord[];
  scenes: SceneRecord[];
  chatSessions: ChatSessionRecord[];
  playbackState: PlaybackStateRecord[];
}> {
  return {
    stages: await db.stages.toArray(),
    scenes: await db.scenes.toArray(),
    chatSessions: await db.chatSessions.toArray(),
    playbackState: await db.playbackState.toArray(),
  };
}

/**
 * Import database contents (for restoring backups)
 */
export async function importDatabase(data: {
  stages?: StageRecord[];
  scenes?: SceneRecord[];
  chatSessions?: ChatSessionRecord[];
  playbackState?: PlaybackStateRecord[];
}): Promise<void> {
  await db.transaction(
    'rw',
    [db.stages, db.scenes, db.chatSessions, db.playbackState],
    async () => {
      if (data.stages) await db.stages.bulkPut(data.stages);
      if (data.scenes) await db.scenes.bulkPut(data.scenes);
      if (data.chatSessions) await db.chatSessions.bulkPut(data.chatSessions);
      if (data.playbackState) await db.playbackState.bulkPut(data.playbackState);
    },
  );
  log.info('Database imported successfully');
}

// ==================== Convenience Query Functions ====================

/**
 * Get all scenes for a course
 */
export async function getScenesByStageId(stageId: string): Promise<SceneRecord[]> {
  return db.scenes.where('stageId').equals(stageId).sortBy('order');
}

/**
 * Delete a course and all its related data
 */
export async function deleteStageWithRelatedData(stageId: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('openmaic-auth');
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { userId?: string } };
        const uid = parsed?.state?.userId?.trim();
        if (uid) headers['x-user-id'] = uid;
      }
    } catch {
      // ignore parse failures
    }
  }
  const resp = await fetch(`/api/notebooks/${encodeURIComponent(stageId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers,
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: '删除失败' }));
    throw new Error(data.error || '删除失败');
  }
}

/**
 * Get all generated agents for a course
 */
export async function getGeneratedAgentsByStageId(
  stageId: string,
): Promise<GeneratedAgentRecord[]> {
  return db.generatedAgents.where('stageId').equals(stageId).toArray();
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  return {
    courses: await db.courses.count(),
    stages: await db.stages.count(),
    scenes: await db.scenes.count(),
    audioFiles: await db.audioFiles.count(),
    imageFiles: await db.imageFiles.count(),
    snapshots: await db.snapshots.count(),
    chatSessions: await db.chatSessions.count(),
    playbackState: await db.playbackState.count(),
    stageOutlines: await db.stageOutlines.count(),
    mediaFiles: await db.mediaFiles.count(),
    generatedAgents: await db.generatedAgents.count(),
    contactConversations: await db.contactConversations.count(),
    agentTasks: await db.agentTasks.count(),
  };
}
