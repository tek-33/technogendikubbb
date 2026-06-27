// Backwards-compatible re-export.
// The actual provider + state lives in contexts/LiveMessagesContext.jsx so the
// EventSource is shared across every consuming component.
export { useLiveMessages } from "../contexts/LiveMessagesContext";
