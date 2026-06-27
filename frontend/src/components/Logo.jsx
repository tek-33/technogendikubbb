import React from "react";

export const Logo = ({ size = "lg" }) => {
    const cls =
        size === "lg"
            ? "text-4xl sm:text-5xl lg:text-6xl"
            : size === "md"
              ? "text-3xl sm:text-4xl"
              : "text-2xl";
    return (
        <div className="flex flex-col items-center select-none">
            <h1
                data-testid="td-logo"
                data-text="TECHNODONATE"
                className={`td-logo ${cls}`}
            >
                TECHNODONATE
            </h1>
            <p
                className="font-display tracking-techno text-[11px] sm:text-xs mt-3 uppercase"
                style={{ color: "var(--accent-cyan)", letterSpacing: "0.4em" }}
                data-testid="td-tagline"
            >
                Message to P&apos; Techno Gen
            </p>
        </div>
    );
};

export default Logo;
