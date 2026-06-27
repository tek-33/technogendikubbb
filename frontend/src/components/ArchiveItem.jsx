import React, { useMemo } from "react";
import { REACTION_EMOJIS, reactToMessage } from "../api/messages";

const ReactionBar = ({ msg, onReact }) => {
    const reactions = msg.reactions || {};
    return (
        <div className="flex flex-wrap gap-1.5 mt-2">
            {REACTION_EMOJIS.map((e) => {
                const c = reactions[e] || 0;
                return (
                    <button
                        key={e}
                        type="button"
                        className="td-reaction"
                        onClick={(ev) => {
                            ev.stopPropagation();
                            onReact(msg.id, e);
                        }}
                        data-testid={`react-${msg.id}-${e}`}
                        aria-label={`React with ${e}`}
                    >
                        <span className="td-reaction-emoji">{e}</span>
                        {c > 0 && (
                            <span
                                className="td-reaction-count"
                                data-testid={`react-count-${msg.id}-${e}`}
                            >
                                {c}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

const HoverBreakdown = ({ msg }) => {
    const reactions = msg.reactions || {};
    const breakdown = useMemo(() => {
        const entries = REACTION_EMOJIS.map((e) => ({
            emoji: e,
            count: reactions[e] || 0,
        }));
        const total = entries.reduce((a, b) => a + b.count, 0);
        const sorted = [...entries].sort((a, b) => b.count - a.count);
        return { entries: sorted, total };
    }, [reactions]);

    return (
        <div
            className="td-archive-popup td-glass"
            data-testid={`archive-popup-${msg.id}`}
            role="tooltip"
        >
            <div className="td-archive-popup-head">
                <span
                    className="font-display tracking-techno uppercase"
                    style={{ color: "var(--accent-cyan)", fontSize: 10 }}
                >
                    Reaction Breakdown
                </span>
                <span
                    className="font-display"
                    style={{
                        color: "var(--accent-gold)",
                        fontSize: 11,
                        letterSpacing: "0.1em",
                    }}
                >
                    Σ {breakdown.total}
                </span>
            </div>

            {breakdown.total === 0 ? (
                <div
                    className="text-xs mt-2"
                    style={{ color: "var(--text-muted)" }}
                >
                    No reactions yet — be the first ✦
                </div>
            ) : (
                <ul className="td-archive-popup-list">
                    {breakdown.entries
                        .filter((x) => x.count > 0)
                        .map(({ emoji, count }) => {
                            const pct = Math.round(
                                (count / breakdown.total) * 100,
                            );
                            return (
                                <li
                                    key={emoji}
                                    className="td-archive-popup-row"
                                    data-testid={`archive-popup-row-${msg.id}-${emoji}`}
                                >
                                    <span className="td-archive-popup-emoji">
                                        {emoji}
                                    </span>
                                    <div className="td-archive-popup-bar">
                                        <div
                                            className="td-archive-popup-bar-fill"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="td-archive-popup-count">
                                        {count}
                                    </span>
                                    <span className="td-archive-popup-pct">
                                        {pct}%
                                    </span>
                                </li>
                            );
                        })}
                </ul>
            )}
        </div>
    );
};

export default function ArchiveItem({ msg, onReact }) {
    return (
        <div
            className="td-archive-item td-archive-item-wrap"
            data-testid={`archive-item-${msg.id}`}
        >
            <div className="flex items-baseline gap-3">
                <span
                    className="font-display text-xs tracking-techno uppercase"
                    style={{ color: "var(--accent-gold)" }}
                >
                    {msg.nickname}
                </span>
                <span
                    className="text-sm flex-1"
                    style={{ color: "var(--text-primary)" }}
                >
                    {msg.message}
                </span>
            </div>
            <ReactionBar msg={msg} onReact={onReact} />
            <HoverBreakdown msg={msg} />
        </div>
    );
}

export { reactToMessage };
