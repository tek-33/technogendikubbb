import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";

const STORAGE_KEY = "td_theme";

const ThemeContext = createContext({
    light: false,
    toggle: () => {},
});

const readStored = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) === "light";
    } catch {
        return false;
    }
};

/**
 * Single source of truth for the cinematic light/dark theme.
 * - Persists in localStorage under `td_theme`
 * - Applies/removes the `td-light` class on <body>
 * - Reacts to cross-tab changes via the `storage` event
 */
export const ThemeProvider = ({ children }) => {
    const [light, setLight] = useState(readStored);

    // Apply class + persist on change
    useEffect(() => {
        if (typeof document !== "undefined") {
            document.body.classList.toggle("td-light", light);
        }
        try {
            localStorage.setItem(STORAGE_KEY, light ? "light" : "dark");
        } catch {}
    }, [light]);

    // Sync across tabs
    useEffect(() => {
        const handler = (e) => {
            if (e.key === STORAGE_KEY) {
                setLight(e.newValue === "light");
            }
        };
        window.addEventListener("storage", handler);
        return () => window.removeEventListener("storage", handler);
    }, []);

    const toggle = useCallback(() => setLight((v) => !v), []);

    return (
        <ThemeContext.Provider value={{ light, toggle }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
