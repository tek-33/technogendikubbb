import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    listMessages,
    getMessageCount,
    streamUrl,
} from "../api/messages";

const defaultState = {
    messages: [],
    count: { total: 0, today: 0 },
    loaded: false,
    connected: true,
};

const LiveMessagesContext = createContext(defaultState);

/**
 * Single shared EventSource + initial fetch for the whole app.
 * Any component can subscribe via useLiveMessages().
 */
export const LiveMessagesProvider = ({ children, pollInterval = 3000 }) => {
    const [messages, setMessages] = useState([]);
    const [count, setCount] = useState({ total: 0, today: 0 });
    const [loaded, setLoaded] = useState(false);
    const [connected, setConnected] = useState(true);
    const refetchTimer = useRef(null);

    useEffect(() => {
        let stopped = false;

        const refetch = async () => {
            try {
                const [msgs, cnt] = await Promise.all([
                    listMessages(),
                    getMessageCount(),
                ]);
                if (stopped) return;
                setMessages(msgs || []);
                setCount(cnt || { total: 0, today: 0 });
                setConnected(true);
                setLoaded(true);
            } catch {
                setConnected(false);
            }
        };

        const scheduleRefetch = () => {
            if (refetchTimer.current) clearTimeout(refetchTimer.current);
            refetchTimer.current = setTimeout(refetch, 120);
        };

        refetch();

        let es = null;
        let pollId = null;

        const startPolling = () => {
            if (pollId) return;
            pollId = setInterval(refetch, pollInterval);
        };

        if (typeof window !== "undefined" && "EventSource" in window) {
            try {
                es = new EventSource(streamUrl);
                es.addEventListener("hello", () => setConnected(true));
                es.addEventListener("message.created", scheduleRefetch);
                es.addEventListener("messages.reset", scheduleRefetch);
                es.addEventListener("reaction.added", scheduleRefetch);
                es.onerror = () => {
                    setConnected(false);
                    startPolling();
                };
                es.onopen = () => {
                    setConnected(true);
                    if (pollId) {
                        clearInterval(pollId);
                        pollId = null;
                    }
                };
            } catch {
                startPolling();
            }
        } else {
            startPolling();
        }

        return () => {
            stopped = true;
            if (es) es.close();
            if (pollId) clearInterval(pollId);
            if (refetchTimer.current) clearTimeout(refetchTimer.current);
        };
    }, [pollInterval]);

    return (
        <LiveMessagesContext.Provider
            value={{ messages, count, loaded, connected }}
        >
            {children}
        </LiveMessagesContext.Provider>
    );
};

export const useLiveMessages = () => useContext(LiveMessagesContext);
