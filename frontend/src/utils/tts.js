// TTS helper using Web Speech API
// Reads only: "[nickname] ส่งข้อความว่า [message]"

const isThai = (text) => /[\u0E00-\u0E7F]/.test(text);

let cachedVoices = null;

const loadVoices = () =>
    new Promise((resolve) => {
        const synth = window.speechSynthesis;
        const existing = synth.getVoices();
        if (existing && existing.length) {
            cachedVoices = existing;
            return resolve(existing);
        }
        const handler = () => {
            cachedVoices = synth.getVoices();
            synth.removeEventListener("voiceschanged", handler);
            resolve(cachedVoices || []);
        };
        synth.addEventListener("voiceschanged", handler);
        // safety timeout
        setTimeout(() => resolve(synth.getVoices() || []), 700);
    });

const pickVoice = (voices, lang) => {
    if (!voices || !voices.length) return null;
    const exact = voices.find((v) => v.lang === lang);
    if (exact) return exact;
    const partial = voices.find((v) =>
        v.lang.toLowerCase().startsWith(lang.split("-")[0]),
    );
    return partial || null;
};

export const speakMessage = async (nickname, message) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    synth.cancel();

    const useThai = isThai(message) || isThai(nickname);
    const lang = useThai ? "th-TH" : "en-US";
    const text = useThai
        ? `${nickname} ส่งข้อความว่า ${message}`
        : `${nickname} sends a message: ${message}`;

    const voices = cachedVoices || (await loadVoices());
    const voice = pickVoice(voices, lang);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    synth.speak(utterance);
};

export const stopSpeaking = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
};
