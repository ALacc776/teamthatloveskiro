// In-memory store of stock-check calls, keyed by our own callId.
// Demo-grade (resets on server restart). Enough for the hackathon.
// Shape: { callId: { status, pharmacyName, phone, inStock, summary, readyTime, updatedAt } }

const store = globalThis.__rxreachCalls || (globalThis.__rxreachCalls = new Map());

export function putCall(callId, data) {
  store.set(callId, { ...(store.get(callId) || {}), ...data, updatedAt: Date.now() });
}
export function getCall(callId) {
  return store.get(callId) || null;
}
// Map Vapi's call id -> our callId so the webhook can find the record.
const vapiIndex = globalThis.__rxreachVapiIndex || (globalThis.__rxreachVapiIndex = new Map());
export function linkVapiId(vapiCallId, callId) { vapiIndex.set(vapiCallId, callId); }
export function callIdForVapi(vapiCallId) { return vapiIndex.get(vapiCallId) || null; }
