import * as vscode from "vscode";
import * as path from "path";
import * as fsp from "fs/promises";
import {
	ConnectionProfile,
	ConnectionsFile,
	ConnectionsChangedEvent,
} from "./types";

const CONNECTIONS_DIR = ".prompty";
const CONNECTIONS_FILE = "connections.json";
const SECRET_PREFIX = "prompty-connection-";

/**
 * Hybrid connection store:
 * - Profiles (non-sensitive) in workspace `.prompty/connections.json`
 * - Secrets (API keys) in VSCode SecretStorage (OS keychain)
 */
export class ConnectionStore {
	private readonly _onDidChange =
		new vscode.EventEmitter<ConnectionsChangedEvent>();
	readonly onDidChange = this._onDidChange.event;

	private fileWatcher: vscode.FileSystemWatcher | undefined;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private readonly secretStorage: vscode.SecretStorage) {
		this.watchConfigFile();
	}

	/** Serialize file mutations to prevent concurrent read-modify-write races */
	private enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
		const next = this.writeQueue.then(fn, fn);
		this.writeQueue = next.then(() => undefined, () => undefined);
		return next;
	}

	// ─── Profile Operations ──────────────────────────────────────────

	/** Get all connection profiles from workspace config */
	async getProfiles(): Promise<ConnectionProfile[]> {
		const file = await this.readConnectionsFile();
		return file?.connections ?? [];
	}

	/** Get a single profile by ID */
	async getProfile(id: string): Promise<ConnectionProfile | undefined> {
		const profiles = await this.getProfiles();
		return profiles.find((p) => p.id === id);
	}

	/** Save or update a connection profile */
	async saveProfile(profile: ConnectionProfile): Promise<void> {
		await this.enqueueWrite(async () => {
			const file = await this.readConnectionsFile();
			const targetFile = file ?? {
				version: 1,
				connections: [],
			};

			const existingIndex = targetFile.connections.findIndex(
				(c) => c.id === profile.id
			);
			const isNew = existingIndex === -1;

			if (isNew) {
				targetFile.connections.push(profile);
			} else {
				targetFile.connections[existingIndex] = profile;
			}

			await this.writeConnectionsFile(targetFile);

			this._onDidChange.fire(
				isNew ? { added: [profile] } : { updated: [profile] }
			);
		});
	}

	/** Delete a connection profile and its secret */
	async deleteProfile(id: string): Promise<void> {
		await this.enqueueWrite(async () => {
			const file = await this.readConnectionsFile();
			if (!file) {return;}

			const profile = file.connections.find((c) => c.id === id);
			if (!profile) {return;}

			file.connections = file.connections.filter((c) => c.id !== id);
			await this.writeConnectionsFile(file);
			await this.deleteSecret(id);

			this._onDidChange.fire({ removed: [profile] });
		});
	}

	/** Set a connection as the default for its provider type */
	async setDefault(id: string): Promise<void> {
		await this.enqueueWrite(async () => {
			const file = await this.readConnectionsFile();
			if (!file) {return;}

			const target = file.connections.find((c) => c.id === id);
			if (!target) {return;}

			// Collect all profiles whose isDefault changed
			const updated: ConnectionProfile[] = [];
			for (const conn of file.connections) {
				if (conn.providerType === target.providerType) {
					const wasDefault = conn.isDefault ?? false;
					conn.isDefault = conn.id === id;
					if (wasDefault !== conn.isDefault) {
						updated.push(conn);
					}
				}
			}

			await this.writeConnectionsFile(file);
			if (updated.length > 0) {
				this._onDidChange.fire({ updated });
			}
		});
	}

	/** Get the default connection for a provider type */
	async getDefault(
		providerType: string
	): Promise<ConnectionProfile | undefined> {
		const profiles = await this.getProfiles();
		return (
			profiles.find(
				(p) => p.providerType === providerType && p.isDefault
			) ?? profiles.find((p) => p.providerType === providerType)
		);
	}

	// ─── Secret Operations ───────────────────────────────────────────

	/** Get the API key for a connection */
	async getSecret(connectionId: string): Promise<string | undefined> {
		return this.secretStorage.get(`${SECRET_PREFIX}${connectionId}`);
	}

	/** Store an API key for a connection */
	async setSecret(connectionId: string, secret: string): Promise<void> {
		await this.secretStorage.store(
			`${SECRET_PREFIX}${connectionId}`,
			secret
		);
	}

	/** Delete the API key for a connection */
	async deleteSecret(connectionId: string): Promise<void> {
		await this.secretStorage.delete(`${SECRET_PREFIX}${connectionId}`);
	}

	// ─── File Operations ─────────────────────────────────────────────

	/** Ensure the parent directory of the connections file exists. */
	private async ensureConnectionsDir(): Promise<void> {
		const filePath = this.getConnectionsFilePath();
		if (!filePath) {return;}
		const dir = path.dirname(filePath);
		await fsp.mkdir(dir, { recursive: true });
	}

	private getConnectionsFilePath(): string | undefined {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {return undefined;}

		return path.join(
			workspaceFolders[0].uri.fsPath,
			CONNECTIONS_DIR,
			CONNECTIONS_FILE,
		);
	}

	private async readConnectionsFile(): Promise<ConnectionsFile | null> {
		const filePath = this.getConnectionsFilePath();
		if (!filePath) {return null;}

		let content: string;
		try {
			content = await fsp.readFile(filePath, "utf-8");
		} catch (err: unknown) {
			// File doesn't exist yet — return null so caller initializes
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				return null;
			}
			throw err;
		}

		const parsed = JSON.parse(content) as Partial<ConnectionsFile>;
		return {
			version: typeof parsed.version === "number" ? parsed.version : 1,
			connections: Array.isArray(parsed.connections) ? parsed.connections : [],
		};
	}

	private async writeConnectionsFile(file: ConnectionsFile): Promise<void> {
		const filePath = this.getConnectionsFilePath();
		if (!filePath) {
			throw new Error("No workspace folder open");
		}

		await this.ensureConnectionsDir();
		await fsp.writeFile(filePath, JSON.stringify(file, null, 2), "utf-8");
	}

	private watchConfigFile(): void {
		const pattern = new vscode.RelativePattern(
			vscode.workspace.workspaceFolders?.[0] ?? "",
			`${CONNECTIONS_DIR}/${CONNECTIONS_FILE}`
		);

		this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
		this.fileWatcher.onDidChange(() => {
			this._onDidChange.fire({});
		});
		this.fileWatcher.onDidCreate(() => {
			this._onDidChange.fire({});
		});
		this.fileWatcher.onDidDelete(() => {
			this._onDidChange.fire({});
		});
	}

	dispose(): void {
		this._onDidChange.dispose();
		this.fileWatcher?.dispose();
	}
}
