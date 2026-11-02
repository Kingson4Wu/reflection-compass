import { QUESTIONS } from "./domain";
export type Language = "zh-CN" | "en";
export const normalizeLanguage = (value: unknown): Language =>
  value === "en" ? "en" : "zh-CN";
const englishQuestions = [
  "Is what I’m doing taking me toward the life I want?",
  "What might I be avoiding by doing this?",
  "What is the smallest next step I can take?",
  "When did I feel most alive today?",
];
export function localizedQuestions(language: Language): string[] {
  return language === "en" ? [...englishQuestions] : [...QUESTIONS];
}
export function questionText(value: string, language: Language) {
  const index =
    QUESTIONS.indexOf(value) >= 0
      ? QUESTIONS.indexOf(value)
      : englishQuestions.indexOf(value);
  return index < 0 ? value : localizedQuestions(language)[index];
}
