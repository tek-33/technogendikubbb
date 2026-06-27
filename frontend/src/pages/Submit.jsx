import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import {
    ConnectionBadge,
    CounterBadge,
    ThemeToggle,
} from "../components/StatusBadges";
import { useTheme } from "../hooks/useTheme";
import { hasProfanity } from "../utils/profanity";
import { createMessage } from "../api/messages";
import { useLiveMessages } from "../hooks/useLiveMessages";

const COOLDOWN_MS = 10000;
const MAX_NICK = 30;
const MAX_MSG = 200;

export default function Submit() {
    const { light, toggle } = useTheme();
    const [nickname, setNickname] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState("");
    const [cooldown, setCooldown] = useState(0);
    const { count } = useLiveMessages();
    const tickRef = useRef(null);

    // Cooldown ticker
    useEffect(() => {
        if (cooldown <= 0) return;
        tickRef.current = setInterval(() => {
            setCooldown((c) => {
                if (c <= 100) {
                    clearInterval(tickRef.current);
                    return 0;
                }
                return c - 100;
            });
        }, 100);
        return () => clearInterval(tickRef.current);
    }, [cooldown > 0]);

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(""), 2800);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        const nick = nickname.trim();
        const msg = message.trim();
        if (!nick) return setError("Please enter a nickname.");
        if (!msg) return setError("Please enter a message.");
        if (nick.length > MAX_NICK)
            return setError(`Nickname must be ≤ ${MAX_NICK} characters.`);
        if (msg.length > MAX_MSG)
            return setError(`Message must be ≤ ${MAX_MSG} characters.`);
        if (hasProfanity(nick) || hasProfanity(msg))
            return setError("Please keep it respectful — profanity detected.");

        setSubmitting(true);
        try {
            await createMessage(nick, msg);
            setNickname("");
            setMessage("");
            showToast("Transmission sent ✦");
            setCooldown(COOLDOWN_MS);
        } catch (err) {
            setError(
                err?.response?.data?.detail ||
                    "Network error — please try again.",
            );
        } finally {
            setSubmitting(false);
        }
    };

    const cooldownPct = (cooldown / COOLDOWN_MS) * 100;
    const cooldownSec = Math.ceil(cooldown / 1000);

    return (
        <div className="td-space relative min-h-screen">
            {/* Top bar */}
            <div className="relative z-10 flex justify-between items-center px-6 sm:px-12 pt-6">
                <ConnectionBadge />
                <div className="flex items-center gap-3">
                    <CounterBadge count={count.today} label="Today" />
                    <ThemeToggle light={light} onToggle={toggle} />
                    <Link
                        to="/display"
                        className="td-btn-ghost"
                        data-testid="open-display-link"
                    >
                        Display →
                    </Link>
                </div>
            </div>

            {/* Logo */}
            <div className="relative z-10 mt-12 sm:mt-16 flex justify-center px-4">
                <Logo size="lg" />
            </div>

            {/* Card */}
            <div className="relative z-10 mt-12 sm:mt-16 flex justify-center px-4 pb-24">
                <form
                    onSubmit={handleSubmit}
                    className="td-glass td-card-3d w-full max-w-xl p-8 sm:p-10"
                    data-testid="submit-card"
                >
                    <div className="mb-8">
                        <h2
                            className="font-display tracking-techno text-base md:text-lg uppercase"
                            style={{ color: "var(--accent-cyan)" }}
                        >
                            Compose Transmission
                        </h2>
                        <p
                            className="text-sm mt-2"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Beam a message across the void to P&apos; Techno
                            Gen.
                        </p>
                    </div>

                    <label
                        className="font-display text-xs tracking-techno uppercase block mb-2"
                        style={{ color: "var(--text-muted)" }}
                        htmlFor="nickname"
                    >
                        Nickname
                    </label>
                    <input
                        id="nickname"
                        type="text"
                        value={nickname}
                        onChange={(e) =>
                            setNickname(e.target.value.slice(0, MAX_NICK))
                        }
                        placeholder="e.g. P' Art"
                        maxLength={MAX_NICK}
                        className="td-field mb-1"
                        aria-label="Your nickname"
                        data-testid="nickname-input"
                        autoComplete="off"
                    />
                    <div
                        className="text-xs mb-5 text-right"
                        style={{ color: "var(--text-muted)" }}
                    >
                        {nickname.length}/{MAX_NICK}
                    </div>

                    <label
                        className="font-display text-xs tracking-techno uppercase block mb-2"
                        style={{ color: "var(--text-muted)" }}
                        htmlFor="message"
                    >
                        Message
                    </label>
                    <textarea
                        id="message"
                        rows={4}
                        value={message}
                        onChange={(e) =>
                            setMessage(e.target.value.slice(0, MAX_MSG))
                        }
                        placeholder="Type something epic…"
                        maxLength={MAX_MSG}
                        className="td-field mb-1 resize-none"
                        aria-label="Your message"
                        data-testid="message-input"
                    />
                    <div
                        className="text-xs mb-5 text-right"
                        style={{ color: "var(--text-muted)" }}
                        data-testid="char-counter"
                    >
                        {message.length}/{MAX_MSG}
                    </div>

                    {error && (
                        <div
                            role="status"
                            data-testid="form-error"
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
                        disabled={submitting || cooldown > 0}
                        className="td-btn w-full mt-2"
                        data-testid="send-btn"
                    >
                        {submitting
                            ? "Transmitting…"
                            : cooldown > 0
                              ? `Please wait… (${cooldownSec}s)`
                              : "Send Transmission"}
                    </button>

                    {cooldown > 0 && (
                        <div className="td-cooldown" data-testid="cooldown-bar">
                            <div
                                className="td-cooldown-fill"
                                style={{ width: `${cooldownPct}%` }}
                            />
                        </div>
                    )}

                    {submitting && (
                        <div
                            className="absolute inset-0 flex items-center justify-center rounded-2xl"
                            style={{ background: "rgba(3,5,15,0.55)" }}
                            data-testid="loading-overlay"
                        >
                            <div className="td-spinner" />
                        </div>
                    )}
                </form>
            </div>

            {toast && (
                <div className="td-toast" role="status" data-testid="toast">
                    {toast}
                </div>
            )}
        </div>
    );
}
