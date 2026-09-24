export const CONTACT_TOPICS = [
  { value: "plans", label: "Plans and pricing" },
  { value: "support", label: "Help with my account" },
  { value: "partnerships", label: "Partnerships" },
  { value: "press", label: "Press" },
  { value: "security", label: "Report a security issue" },
  { value: "other", label: "Something else" },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["value"];

export function isContactTopic(value: string): value is ContactTopic {
  return CONTACT_TOPICS.some((t) => t.value === value);
}
