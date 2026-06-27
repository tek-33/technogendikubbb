import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const createMessage = async (nickname, message) => {
    const { data } = await axios.post(`${API}/messages`, { nickname, message });
    return data;
};

export const listMessages = async () => {
    const { data } = await axios.get(`${API}/messages`);
    return data;
};

export const deleteAllMessages = async () => {
    const { data } = await axios.delete(`${API}/messages`);
    return data;
};

export const getMessageCount = async () => {
    const { data } = await axios.get(`${API}/messages/count`);
    return data;
};

export const reactToMessage = async (id, emoji) => {
    const { data } = await axios.post(`${API}/messages/${id}/react`, { emoji });
    return data;
};

export const streamUrl = `${API}/messages/stream`;
export const exportCsvUrl = `${API}/messages/export.csv`;

export const REACTION_EMOJIS = ["🔥", "❤️", "✨", "🎉", "🤯", "👏", "💜", "🚀"];
