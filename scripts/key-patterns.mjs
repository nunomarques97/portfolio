// Key-shaped content patterns used by the commit guard (scripts/key-rules.mjs, scripts/guard-keys.mjs).
//
// Each pattern must not trip on prose or code that merely talks about credentials ("a Bearer token",
// "the key=value format"), and must run in linear time on any input: separators use bounded quantifiers,
// adjacent quantified parts never accept the same characters, and each open-ended run is a single
// character class that cannot backtrack into its neighbour.

const HEADER_NAMES = String.raw`\b(?:x-api-key|api-key|proxy-authorization|authorization)`;
const HEADER_SEPARATOR = String.raw`(?:\\{0,3}["'][ \t]{0,16}:[ \t]{0,16}\\{0,3}["']|[ \t]{0,16}:[ \t]{0,16}(?:\\{0,3}["'])?)`;
const QUERY_NAMES = String.raw`\b(?:api[_-]?key|access_token|token|secret|password|auth|key)=`;
const ASSIGNMENT_NAME_LIST = String.raw`(api[_-]?key|secret|token|password|passwd|auth)\b`;
const ASSIGNMENT_TAIL = String.raw`\\{0,3}["']?\s{0,16}[:=]\s{0,16}\\{0,3}["']`;

/** `{ name, pattern }` entries; `pattern` is non-global and only used with `test()`. */
export const KEY_PATTERNS = [
  { name: 'Anthropic API key', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API key', pattern: /sk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'OpenRouter API key', pattern: /sk-or-(v1-)?[A-Za-z0-9]{32,}/ },
  { name: 'Stripe key', pattern: /(sk|rk)_(live|test)_[A-Za-z0-9]{20,}/ },
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'AWS access key', pattern: /(AKIA|ASIA)[0-9A-Z]{16}/ },
  { name: 'GitHub token', pattern: /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}/ },
  { name: 'Slack token', pattern: /xox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Hugging Face token', pattern: /hf_[A-Za-z0-9]{30,}/ },
  { name: 'Groq API key', pattern: /gsk_[A-Za-z0-9]{40,}/ },
  { name: 'Private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    // `x-api-key: <value>`, `Authorization: Bearer <value>`: one opaque run of 16+ characters.
    name: 'Credential header line',
    pattern: new RegExp(
      String.raw`${HEADER_NAMES}${HEADER_SEPARATOR}(?:(?:bearer|basic|token|digest)[ \t]{1,8})?[A-Za-z0-9._~+/=-]{16,}`,
      'i',
    ),
  },
  {
    // Also asks for one digit, `+`, `/` or `=`, which every realistic credential has and prose does not.
    name: 'Bearer or Basic credential',
    pattern: /\b(?:bearer|basic)[ \t]{1,8}(?=[A-Za-z._~-]{0,1024}[0-9+/=])[A-Za-z0-9._~+/-]{16,}=*/i,
  },
  {
    // Unquoted `name=value` in query strings and environment dumps, with a value of 8+ characters.
    name: 'Credential query parameter',
    pattern: new RegExp(`${QUERY_NAMES}[A-Za-z0-9._~%+/=-]{8,}`, 'i'),
  },
  {
    // `scheme://user:<password of 8+ characters>@host`.
    name: 'URL userinfo',
    pattern: /:\/\/[A-Za-z0-9._~%!$&'()*+,;=-]+:[A-Za-z0-9._~%!$&'()*+,;=:-]{8,}@/,
  },
  {
    // `api_key = "..."`, `"apiKey": "..."` with a value of 24+ characters.
    name: 'Secret assignment',
    pattern: new RegExp(
      String.raw`\b${ASSIGNMENT_NAME_LIST}${ASSIGNMENT_TAIL}[A-Za-z0-9_+/=.-]{24,}\\{0,3}["']`,
      'i',
    ),
  },
];
