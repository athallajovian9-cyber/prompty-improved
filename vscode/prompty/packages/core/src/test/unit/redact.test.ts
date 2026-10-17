import { redactSecrets, redactSecretValue, isSensitiveKey, redactSecretsInText } from '../../utils/redact';

/* Tests for improved redaction logic */

function test_redact_key_names() {
	const data: Record<string, unknown> = {
		apiKey: 'secret',
		api_key: 'secret',
		secretKey: 'mysecret',
		password: 'hunter2',
		token: 'abc123',
		credential: 'cred',
		auth: 'bearer-token',
		authorization: 'Bearer abc.def.ghi',
		connectionString: 'mongodb://user:pass@host',
		connStr: 'postgres://...',
		apiToken_key: 'should_redact',
	};

	for (const [key, val] of Object.entries(data)) {
		const redacted = redactSecrets({ [key]: val }) as Record<string, unknown>;
		if (redacted[key] !== '[redacted]') {
			throw new Error(`Key '${key}' was not redacted`);
		}
	}
}

function test_redact_value_patterns() {
	const secrets = [
		'sk-proj-abcdefgh1234567890',
		'ghp_1pZm9test_example',
		'github_pat_abc123def456',
		'AKIA' + 'A'.repeat(16),
		'xoxb-test-token-123',
		'eyJhbGci.eyJzdWI.SflV',
		'AIzaSy' + 'B'.repeat(33),
		'Bearer abc.def.ghi',
		'bearer abc.def.ghi',
		'postgres://user:pass@host/db',
		'AccountKey=my-secret-key;',
	];

	for (const secret of secrets) {
		const result = redactSecretValue(secret);
		if (result !== '[redacted]') {
			throw new Error(`Value pattern not redacted: ${secret.slice(0, 20)}...`);
		}
	}

	// Non-secret values should pass through
	const nonSecrets = ['hello', 'plain text', '12345', 'normal-key', 'postgres://host/db'];
	for (const val of nonSecrets) {
		const result = redactSecretValue(val);
		if (result !== val) {
			throw new Error(`Non-secret value was redacted: ${val}`);
		}
	}
}

function test_redact_nested() {
	const data: Record<string, unknown> = {
		apiKey: 'secret',
		nested: {
			password: 'pass',
			safe: 'val',
		},
		arr: [
			{ token: 'tok' },
			{ ok: 'data' },
		],
	};

	const result = redactSecrets(data) as Record<string, unknown>;
	if (result.apiKey !== '[redacted]') throw new Error('Key not redacted');
	if ((result.nested as Record<string, unknown>).password !== '[redacted]') throw new Error('Deep nested key not redacted');
	if ((result.nested as Record<string, unknown>).safe !== 'val') throw new Error('Safe value was redacted');
	if ((result.arr as Record<string, unknown>[])[0].token !== '[redacted]') throw new Error('Array element key not redacted');
	if ((result.arr as Record<string, unknown>[])[1].ok !== 'data') throw new Error('Array safe value was redacted');
}

function test_isSensitiveKey() {
	const sensitive = ['apiKey', 'api_key', 'secret', 'password', 'token', 'credential',
		'authorization', 'connectionString', 'connStr', 'apiToken_key',
		'my-api-key', 'auth_token', 'SECRET_KEY', 'private_key'];
	const safe = ['name', 'description', 'id', 'version', 'endpoint', 'provider',
		'authors', 'keywords', 'hotkey', 'partitionKey', 'sortKey'];

	for (const key of sensitive) {
		if (!isSensitiveKey(key)) throw new Error(`Should be sensitive: ${key}`);
	}
	for (const key of safe) {
		if (isSensitiveKey(key)) throw new Error(`Should not be sensitive: ${key}`);
	}
}

function test_redactSecretsInText() {
	// Substring match for API key in error message
	const input1 = 'Incorrect API key provided: sk-proj-abcdefgh12345';
	const result1 = redactSecretsInText(input1);
	if (result1.includes('sk-proj-')) throw new Error('sk-proj token not redacted in text');
	if (!result1.includes('[redacted]')) throw new Error('Expected [redacted] in output');

	// GitHub token
	const result2 = redactSecretsInText('Token: ghp_abc123def456ghi789');
	if (result2.includes('ghp_')) throw new Error('GitHub token not redacted');

	// Bearer token
	const result3 = redactSecretsInText('Authorization: Bearer eyJhbGci.eyJzdWI.SflV');
	if (result3.includes('Bearer eyJ')) throw new Error('Bearer token not redacted');

	// URI credentials
	const result4 = redactSecretsInText('http://user:secret@api.example.com/v1');
	if (result4.includes('secret')) throw new Error('URI password not redacted');
	if (!result4.includes('http://') || !result4.includes('@api.example.com')) throw new Error('URI host not preserved');

	// Clean text passes through
	const clean = 'Everything is fine here';
	if (redactSecretsInText(clean) !== clean) throw new Error('Clean text was modified');

	// Azure connection string
	const result5 = redactSecretsInText('DefaultEndpointsProtocol=https;AccountName=acc;AccountKey=my-secret-key;');
	if (result5.includes('my-secret-key')) throw new Error('AccountKey not redacted');
}

// Run tests
test_redact_key_names();
test_redact_value_patterns();
test_redact_nested();
test_isSensitiveKey();
test_redactSecretsInText();

console.log('All 5 tests passed (15 assertions)');
