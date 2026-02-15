export const GEMINI_API_KEY_STORAGE_KEY = "gemini-api-key";
export const GROQ_API_KEY_STORAGE_KEY = "groq-api-key";
export const MODEL_PROVIDER_STORAGE_KEY = "model-provider";

export type ModelProvider = "gemini" | "groq";
export const DEFAULT_MODEL_PROVIDER: ModelProvider = "gemini";
