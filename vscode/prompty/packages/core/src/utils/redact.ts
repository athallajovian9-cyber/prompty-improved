/**
 * Improved secret redaction utility.
 *
 * Fixes from the original implementation:
 * - Added "key" pattern to catch "api_key", "secret_key", etc.
 * - Added "auth" to catch "authorization" headers/parameters
 * - Added "connectionString" pattern
 * - Added regex matching to catch partial key names (e.g., "my_api_key_1")
 * - Added string-value redaction for known secret patterns (e.g., "sk-", "AKIA")
 * - Fixed operator precedence bug in Bearer regex (was in || chain, now in patterns[])
 * - Added base64-safe characters to Bearer regex (case-insensitive, allows +,/,=)
 * - Added connection string URL credential detection
 * - Tokenized isSensitiveKey() to avoid false positives (authors, keywords, etc.)
 * - Non-plain objects (Date, RegExp) no longer flattened to {}
 * - Added circular reference guard
 */

export function redactSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
	if (Array.isArray(value)) {
		return value.map(item => redactSecrets(item, seen));
	}
	if (!value || typeof value !== 'object' || value instanceof Date || value instanceof RegExp) {
		return redactSecretValue(value);
	}
	if (seen.has(value)) {
		return '[Circular]';
	}
	seen.add(value);
	const result: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		result[key] = isSensitiveKey(key) ? '[redacted]' : redactSecrets(item, seen);
	}
	return result;
}

export function redactSecretValue(value: unknown): unknown {
	if (typeof value !== 'string') {
		return value;
	}
	const trimmed = value.trim();
	const patterns: RegExp[] = [
		/^sk-(?:proj-|svcacct-|ant-)?[a-zA-Z0-9._-]+$/,              // OpenAI & Anthropic API keys (underscore/dot support)
		/^gh[pousr]_[a-zA-Z0-9_]+$/,                                  // GitHub PAT / OAuth token
		/^github_pat_[a-zA-Z0-9_]+$/,                                  // GitHub fine-grained PAT
		/^AKIA[0-9A-Z]{16}$/,                                          // AWS access key ID
		/^xox[baprs]-[a-zA-Z0-9-]+$/,                                  // Slack token
		/^eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/,     // JWT
		/^AIza[0-9A-Za-z_-]{35}$/,                                     // Google API key
		/^Bearer\s+[a-zA-Z0-9._~+/=-]+$/i,                             // Bearer token (case-insensitive + base64 chars)
		/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/,            // URI with embedded user:password@
		/(?:AccountKey|SharedAccessKey|SharedAccessSignature)=[^;]+/i, // Azure connection string secrets
	];
	if (patterns.some(p => p.test(trimmed))) {
		return '[redacted]';
	}
	return value;
}

export function isSensitiveKey(key: string): boolean {
	const normalized = key.toLowerCase();
	const directMatches = [
		'apikey', 'api_key', 'secret', 'password', 'passwd',
		'token', 'credential', 'connectionstring', 'connstr',
		'authorization', 'private_key', 'privatekey',
	];
	if (directMatches.some(m => normalized.includes(m))) {
		return true;
	}
	// Suffix patterns
	if (normalized.endsWith('_key') || normalized.endsWith('-key') ||
		normalized.endsWith('_token') || normalized.endsWith('_secret')) {
		return true;
	}
	// Prefix patterns
	if (/^(api|app)[-_]*(key|token|secret)/i.test(key)) {
		return true;
	}
	// Tokenized word match — avoids false positives like "authors" matching "auth",
	// or "keywords" matching "key". Only matches "auth" as a standalone word token
	// (authorization is already caught by directMatches).
	const tokens = key
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	return tokens.includes('auth');
}

/** URI with embedded user:password@ credentials */
const URI_CREDENTIALS = /\b([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/g;

/** Known secret formats matched as substrings inside free text (error messages, logs) */
const TEXT_SECRET_PATTERNS: RegExp[] = [
	/\bsk-(?:proj-|svcacct-|ant-)?[A-Za-z0-9._-]{8,}/g,
	/\bgh[pousr]_[A-Za-z0-9_]{8,}/g,
	/\bgithub_pat_[A-Za-z0-9_]+/g,
	/\bAKIA[0-9A-Z]{16}\b/g,
	/\bxox[baprs]-[A-Za-z0-9-]+/g,
	/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
	/\bAIza[0-9A-Za-z_-]{35}\b/g,
	/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
	/(?:AccountKey|SharedAccessKey|SharedAccessSignature|api[-_]?key)\s*[=:]\s*[^;\s,"']+/gi,
];

/** Scrub secrets embedded anywhere inside free text (error messages, logs). */
export function redactSecretsInText(text: string): string {
	let result = text.replace(URI_CREDENTIALS, '$1[redacted]@');
	for (const pattern of TEXT_SECRET_PATTERNS) {
		result = result.replace(pattern, '[redacted]');
	}
	return result;
}
