export interface RegexValidation { ok: boolean; error?: string; regex?: RegExp }

/** A deliberately small custom-rule grammar. It rejects constructs commonly used for ReDoS. */
export function validateCustomPattern(pattern: string, caseSensitive = false): RegexValidation {
  if (!pattern.trim()) return { ok: false, error: "Enter a pattern." };
  if (pattern.length > 200) return { ok: false, error: "Patterns are limited to 200 characters." };
  if (/\(\?[=!<]/.test(pattern)) return { ok: false, error: "Lookaround is not supported in custom rules." };
  if (/\\[1-9]/.test(pattern)) return { ok: false, error: "Backreferences are not supported in custom rules." };
  if (/(\.\*){2,}|(\.\+){2,}/.test(pattern)) return { ok: false, error: "Repeated wildcard groups are not allowed." };
  if (/\((?:[^()]|\\.)*[+*}](?:[^()]|\\.)*\)[+*{]/.test(pattern)) return { ok: false, error: "Nested repetition is not allowed." };
  try {
    return { ok: true, regex: new RegExp(pattern, caseSensitive ? "g" : "gi") };
  } catch {
    return { ok: false, error: "This pattern is not valid regular-expression syntax." };
  }
}
