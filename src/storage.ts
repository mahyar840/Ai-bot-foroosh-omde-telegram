// ---------------------------------------------------------------------------
// Thin helpers around the BOT_KV namespace.
// ---------------------------------------------------------------------------

export interface PendingPost {
  id: string;
  photoFileId: string;       // Telegram file_id of the processed (logo-stamped) photo
  finalCaption: string;
  createdAt: number;
}

export async function savePendingPost(kv: KVNamespace, post: PendingPost) {
  await kv.put(`pending:${post.id}`, JSON.stringify(post), { expirationTtl: 60 * 60 * 24 * 3 });
}

export async function getPendingPost(kv: KVNamespace, id: string): Promise<PendingPost | null> {
  const raw = await kv.get(`pending:${id}`);
  return raw ? JSON.parse(raw) : null;
}

export async function deletePendingPost(kv: KVNamespace, id: string) {
  await kv.delete(`pending:${id}`);
}

// --- Support conversation state, keyed by the customer's chat id ---
export interface SupportState {
  step: "idle" | "awaiting_name" | "awaiting_product" | "awaiting_city" | "done";
  name?: string;
  product?: string;
  city?: string;
  startedAt: number;
}

export async function getSupportState(kv: KVNamespace, chatId: number): Promise<SupportState> {
  const raw = await kv.get(`support:${chatId}`);
  return raw ? JSON.parse(raw) : { step: "idle", startedAt: Date.now() };
}

export async function saveSupportState(kv: KVNamespace, chatId: number, state: SupportState) {
  await kv.put(`support:${chatId}`, JSON.stringify(state), { expirationTtl: 60 * 60 * 6 });
}

export async function clearSupportState(kv: KVNamespace, chatId: number) {
  await kv.delete(`support:${chatId}`);
}

// --- Dedup: Telegram retries webhook delivery if we don't respond fast enough,
// which would otherwise cause the same post to be processed (and sent for
// approval) multiple times. We mark each message as handled the moment we
// see it, so retries are skipped instantly. ---
export async function isAlreadyProcessed(kv: KVNamespace, dedupeKey: string): Promise<boolean> {
  const existing = await kv.get(`processed:${dedupeKey}`);
  return existing !== null;
}

export async function markProcessed(kv: KVNamespace, dedupeKey: string) {
  await kv.put(`processed:${dedupeKey}`, "1", { expirationTtl: 60 * 60 * 24 });
}
