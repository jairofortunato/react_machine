const CONTACT_MSG =
  "Entre em contato com o Jairo pelo WhatsApp (48) 99926-3038 para resolver.";

export function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  // Anthropic / Claude credit errors
  if (
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("quota") ||
    lower.includes("insufficient") ||
    lower.includes("billing") ||
    lower.includes("credit") ||
    lower.includes("overloaded")
  ) {
    return `Os créditos da IA acabaram ou o sistema está sobrecarregado. ${CONTACT_MSG}`;
  }

  // Anthropic auth errors
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("authentication") ||
    lower.includes("invalid.*api.*key") ||
    lower.includes("permission")
  ) {
    return `Erro de autenticação com a IA. ${CONTACT_MSG}`;
  }

  // OpenAI / Whisper credit errors
  if (
    lower.includes("openai") &&
    (lower.includes("quota") || lower.includes("billing") || lower.includes("rate"))
  ) {
    return `Os créditos do serviço de transcrição acabaram. ${CONTACT_MSG}`;
  }

  // RapidAPI errors
  if (
    lower.includes("rapidapi") ||
    lower.includes("you are not subscribed") ||
    lower.includes("too many requests") ||
    (lower.includes("429") && lower.includes("perfil"))
  ) {
    return `Os créditos da busca de perfis acabaram. ${CONTACT_MSG}`;
  }

  return msg;
}
