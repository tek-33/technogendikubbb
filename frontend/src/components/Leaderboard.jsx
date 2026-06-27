import React, { useMemo } from "react";
import { useLiveMessages } from "../hooks/useLiveMessages";

const startOfTodayISO = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

const totalReactions = (m) =>
    Object.values(m.reactions || {}).reduce((a, b) => a + (b || 0), 0);

const topEmoji = (m) => {
    const r = m.reactions || {};
    let best = null;
    let bestCount = 0;
    for (const [emoji, c] of Object.entries(r)) {
        if (c > bestCount) {
            bestCount = c;
            best = emoji;
        }
    }
    return best;
};

export default function Leaderboard() {
    const { messages } = useLiveMessages();

    const top = useMemo(() => {
        const start = startOfTodayISO();
        return [...messages]
            .filter((m) => {
                const ts = new Date(m.timestamp);
                return !Number.isNaN(ts.getTime()) && ts >= start;
            })
            .map((m) => ({ ...m, _total: totalReactions(m) }))
            .filter((m) => m._total > 0)
            .sort((a, b) => b._total - a._total)
            .slice(0, 3);
    }, [messages]);

    if (top.length === 0) return null;

    return (
        <div
            className="td-glass td-leaderboard"
            data-testid="leaderboard-panel"
        >
            <div className="td-leaderboard-head">
                <span
                    className="font-display tracking-techno uppercase"
                    style={{
                        color: "var(--accent-cyan)",
                        fontSize: 11,
                    }}
                >
                    Tonight&apos;s Top Reactions
                </span>
            </div>
            <ol className="td-leaderboard-list">
                {top.map((m, i) => (
                    <li
                        key={m.id}
                        className="td-leaderboard-item"
                        data-testid={`leaderboard-item-${i}`}
                    >
                        <span
                            className="td-leaderboard-rank"
                            data-testid={`leaderboard-rank-${i}`}
                        >
                            {i + 1}
                        </span>
                        <div className="td-leaderboard-body">
                            <div
                                className="td-leaderboard-nick"
                                data-testid={`leaderboard-nick-${i}`}
                            >
                                {m.nickname}
                            </div>
                            <div className="td-leaderboard-msg">
                                {m.message.length > 60
                                    ? m.message.slice(0, 60) + "…"
                                    : m.message}
                            </div>
                        </div>
                        <div className="td-leaderboard-score">
                            <span className="td-leaderboard-emoji">
                                {topEmoji(m)}
                            </span>
                            <span
                                className="td-leaderboard-count"
                                data-testid={`leaderboard-count-${i}`}
                            >
                                {m._total}
                            </span>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}
