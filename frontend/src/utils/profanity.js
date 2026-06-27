// Basic profanity word list (Thai + English) — case insensitive substring match
const WORDS = [
    // English
    "fuck",
    "fucker",
    "fucking",
    "shit",
    "bitch",
    "bastard",
    "asshole",
    "dick",
    "cunt",
    "whore",
    "slut",
    "piss",
    "cock",
    "pussy",
    "motherfucker",
    "nigger",
    "faggot",
    // Thai (transliterated + Thai script — common slurs)
    "เหี้ย",
    "สัส",
    "ควย",
    "เย็ด",
    "หี",
    "ไอ้สัส",
    "ไอ้เหี้ย",
    "แม่ง",
    "มึง",
    "กู",
    "ดอกทอง",
    "ระยำ",
    "shia",
    "shiaa",
    "kuy",
    "yed",
    "hia",
];

export const hasProfanity = (text) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return WORDS.some((w) => lower.includes(w.toLowerCase()));
};
