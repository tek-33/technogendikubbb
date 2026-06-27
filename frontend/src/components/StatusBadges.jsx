import React, { useEffect, useState } from "react";

export const ConnectionBadge = () => {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);
    return (
        <div className="td-badge" data-testid="connection-status">
            <span className={`td-dot ${online ? "" : "offline"}`} />
            {online ? "Online" : "Offline"}
        </div>
    );
};

export const CounterBadge = ({ count, label = "Total" }) => (
    <div className="td-badge" data-testid="message-counter">
        <span style={{ color: "var(--accent-cyan)" }}>{label}</span>
        <span style={{ color: "var(--text-primary)" }}>{count ?? 0}</span>
    </div>
);

export const ThemeToggle = ({ light, onToggle }) => (
    <button
        type="button"
        className="td-btn-ghost"
        onClick={onToggle}
        data-testid="theme-toggle"
        aria-label="Toggle theme"
    >
        {light ? "Dark" : "Light"}
    </button>
);
