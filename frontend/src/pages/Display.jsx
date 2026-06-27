import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import {
    ConnectionBadge,
    CounterBadge,
    ThemeToggle,
} from "../components/StatusBadges";
import { useTheme } from "../hooks/useTheme";
import { useLiveMessages } from "../hooks/useLiveMessages";
import {
    deleteAllMessages,
    reactToMessage,
    exportCsvUrl,
} from "../api/messages";
import { speakMessage, stopSpeaking } from "../utils/tts";
import Leaderboard from "../components/Leaderboard";
import ArchiveItem from "../components/ArchiveItem";

const ALLOWED_EMAIL = "xnytxs@gmail.com";
const ALLOWED_PASSWORD = "h6h6h678";
const AUTH_KEY = "display_auth";
const TTS_KEY = "td_tts";
const HERO_MS = 6000;

const LoginGate = ({ onSuccess }) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [shake, setShake] = useState(false);

    const submit = (e) => {
        e.preventDefault();
        if (
            email.trim().toLowerCase() === ALLOWED_EMAIL &&
            password === ALLOWED_PASSWORD
        ) {
            sessionStorage.setItem(AUTH_KEY, "true");
            onSuccess();
        } else {
            setError("Invalid credentials");
            setShake(true);
            setTimeout(() => setShake(false), 600);
        }
    };

    return (
        <div className="td-modal-overlay">
            <form
                onSubmit={submit}
                className={`td-glass td-modal ${shake ? "td-shake" : ""}`}
                data-testid="login-modal"
            >
                <div className="text-center mb-7">
                    <Logo size="md" />
                </div>
                <h2
                    className="font-display tracking-techno uppercase text-sm mb-6 text-center"
                    style={{ color: "var(--accent-cyan)" }}
                >
                    Authorize Display Access
                </h2>
                <label
                    className="font-display text-xs tracking-techno uppercase block mb-2"
                    style={{ color: "var(--text-muted)" }}
                >
                    Email
                </label>
                <input
                    type="email"
                    className="td-field mb-4"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label="Email"
                    data-testid="login-email"
                    autoFocus
                />
                <label
                    className="font-display text-xs tracking-techno uppercase block mb-2"
                    style={{ color: "var(--text-muted)" }}
                >
                    Password
                </label>
                <input
                    type="password"
                    className="td-field mb-5"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-label="Password"
                    data-testid="login-password"
                />
                {error && (
                    <div
                        role="status"
                        data-testid="login-error"
                        className="text-sm mb-4 px-4 py-3 rounded-lg"
                        style={{
                            background: "rgba(255,59,107,0.08)",
                            border: "1px solid rgba(255,59,107,0.35)",
                            color: "#ff7a99",
                        }}
                    >
                        {error}
                    </div>
                )}
                <button
                    type="submit"
                    className="td-btn w-full"
                    data-testid="login-submit"
                >
                    Enter Display
                </button>
                <div className="text-center mt-5">
                    <Link
                        to="/"
                        className="td-btn-ghost"
                        data-testid="back-home"
                    >
                        ← Back
                    </Link>
                </div>
            </form>
        </div>
    );
};

const ResetConfirm = ({ onConfirm, onCancel }) => (
    <div className="td-modal-overlay">
        <div className="td-glass td-modal" data-testid="reset-modal">
            <h3
                className="font-display tracking-techno uppercase text-base mb-3"
                style={{ color: "var(--accent-cyan)" }}
            >
                Confirm Reset
            </h3>
            <p
                className="text-sm mb-6"
                style={{ color: "var(--text-muted)" }}
            >
                Reset all messages? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
                <button
                    className="td-btn-ghost"
                    onClick={onCancel}
                    data-testid="reset-cancel"
                >
                    Cancel
                </button>
                <button
                    className="td-btn"
                    onClick={onConfirm}
                    data-testid="reset-confirm"
                    style={{ padding: "10px 20px", fontSize: 12 }}
                >
                    Reset All
                </button>
            </div>
        </div>
    </div>
);

const ReactionBar = null; // moved to components/ArchiveItem.jsx

export default function Display() {
    const { light, toggle } = useTheme();
    const [authed, setAuthed] = useState(
        () => sessionStorage.getItem(AUTH_KEY) === "true",
    );
    const [ttsOn, setTtsOn] = useState(
        () => sessionStorage.getItem(TTS_KEY) === "true",
    );
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);

    const { messages, count, loaded, connected } = useLiveMessages();

    const [heroIdx, setHeroIdx] = useState(0);
    const [progress, setProgress] = useState(0);
    const timerRef = useRef(null);

    const currentHero =
        heroIdx < messages.length ? messages[heroIdx] : null;
    const archive = useMemo(
        () => messages.slice(0, heroIdx).slice(-8).reverse(),
        [messages, heroIdx],
    );

    // Persist tts toggle
    useEffect(() => {
        sessionStorage.setItem(TTS_KEY, ttsOn ? "true" : "false");
        if (!ttsOn) stopSpeaking();
    }, [ttsOn]);

    // Speak TTS when a new hero arrives (and tts is on)
    const spokenRef = useRef(null);
    useEffect(() => {
        if (!currentHero) return;
        if (spokenRef.current === currentHero.id) return;
        spokenRef.current = currentHero.id;
        if (ttsOn) {
            speakMessage(currentHero.nickname, currentHero.message);
        }
    }, [currentHero?.id, ttsOn]);

    // Hero countdown
    useEffect(() => {
        if (!currentHero) {
            setProgress(0);
            return;
        }
        setProgress(0);
        const start = Date.now();
        timerRef.current = setInterval(() => {
            const elapsed = Date.now() - start;
            const pct = Math.min(100, (elapsed / HERO_MS) * 100);
            setProgress(pct);
            if (elapsed >= HERO_MS) {
                clearInterval(timerRef.current);
                setHeroIdx((i) => i + 1);
            }
        }, 100);
        return () => clearInterval(timerRef.current);
    }, [currentHero?.id]);

    // Fullscreen tracker
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch {}
    };

    const handleReset = async () => {
        setConfirmReset(false);
        try {
            await deleteAllMessages();
            setHeroIdx(0);
            spokenRef.current = null;
            stopSpeaking();
        } catch {}
    };

    const handleLogout = () => {
        sessionStorage.removeItem(AUTH_KEY);
        stopSpeaking();
        setAuthed(false);
    };

    const handleReact = async (id, emoji) => {
        try {
            await reactToMessage(id, emoji);
            // SSE/polling will refresh state; no local optimistic update needed
        } catch {}
    };

    if (!authed) return <LoginGate onSuccess={() => setAuthed(true)} />;

    return (
        <div className="td-space relative min-h-screen">
            {/* Top bar */}
            <div className="relative z-10 flex flex-wrap justify-between items-center gap-3 px-6 sm:px-12 pt-6">
                <div className="flex items-center gap-3 flex-wrap">
                    <ConnectionBadge />
                    <CounterBadge count={count.total} label="Total" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        className="td-btn-ghost"
                        onClick={() => setTtsOn((v) => !v)}
                        aria-pressed={ttsOn}
                        data-testid="tts-toggle"
                    >
                        {ttsOn ? "TTS On" : "TTS Off"}
                    </button>
                    <button
                        className="td-btn-ghost"
                        onClick={toggleFullscreen}
                        data-testid="fullscreen-btn"
                    >
                        {isFullscreen ? "Exit Full" : "Fullscreen"}
                    </button>
                    <ThemeToggle light={light} onToggle={toggle} />
                    <a
                        className="td-btn-ghost"
                        href={exportCsvUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="export-csv-btn"
                    >
                        Export CSV
                    </a>
                    <button
                        className="td-btn-ghost"
                        onClick={() => setConfirmReset(true)}
                        data-testid="reset-btn"
                        style={{ borderColor: "rgba(255,59,107,0.45)" }}
                    >
                        Reset
                    </button>
                    <button
                        className="td-btn-ghost"
                        onClick={handleLogout}
                        data-testid="logout-btn"
                    >
                        Logout
                    </button>
                </div>
            </div>

            {/* Logo */}
            <div className="relative z-10 mt-6 sm:mt-8 flex justify-center px-4">
                <Logo size="md" />
            </div>

            {/* Hero zone */}
            <div className="relative z-10 mt-10 px-4 sm:px-12 flex justify-center min-h-[42vh]">
                {currentHero ? (
                    <div
                        key={currentHero.id}
                        className="td-hero w-full max-w-4xl"
                        data-testid="hero-card"
                    >
                        <div
                            className="td-hero-nick text-sm sm:text-base mb-5"
                            data-testid="hero-nickname"
                        >
                            ✦ {currentHero.nickname}
                        </div>
                        <div
                            className="td-hero-msg text-2xl sm:text-3xl md:text-4xl lg:text-5xl"
                            data-testid="hero-message"
                        >
                            {currentHero.message}
                        </div>
                        <div className="td-hero-progress">
                            <div
                                className="td-hero-progress-fill"
                                style={{ width: `${progress}%` }}
                                data-testid="hero-progress"
                            />
                        </div>
                    </div>
                ) : (
                    <div
                        className="td-empty flex flex-col items-center justify-center py-16"
                        data-testid="empty-state"
                    >
                        <div className="td-empty-orb" />
                        <div className="text-sm sm:text-base">
                            {loaded
                                ? "Waiting for transmissions…"
                                : "Establishing link…"}
                        </div>
                    </div>
                )}
            </div>

            {/* Archive strip */}
            <div className="relative z-10 mt-12 px-4 sm:px-12 pb-12">
                <Leaderboard />
                <h3
                    className="font-display tracking-techno uppercase text-xs mb-4"
                    style={{ color: "var(--text-muted)" }}
                >
                    Archive
                </h3>
                <div
                    className="flex flex-col gap-2 max-h-[36vh] overflow-y-auto pr-2"
                    data-testid="archive-strip"
                >
                    {archive.length === 0 && (
                        <div
                            className="text-sm"
                            style={{ color: "var(--text-muted)" }}
                        >
                            — Empty —
                        </div>
                    )}
                    {archive.map((m) => (
                        <ArchiveItem
                            key={m.id}
                            msg={m}
                            onReact={handleReact}
                        />
                    ))}
                </div>
            </div>

            {confirmReset && (
                <ResetConfirm
                    onConfirm={handleReset}
                    onCancel={() => setConfirmReset(false)}
                />
            )}

            {!connected && (
                <div className="td-toast" data-testid="conn-warning">
                    Reconnecting…
                </div>
            )}
        </div>
    );
}
