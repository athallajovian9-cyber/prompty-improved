import * as vscode from "vscode";
import {
	IConnectionProvider,
	ConnectionProfile,
	ConnectionProviderType,
	ConnectionTestResult,
	ProviderRegistration,
} from "./types";
import { redactSecretsInText } from '../utils/redact';

/**
 * Central registry for connection providers.
 * Built-in providers are registered at activation.
 * External extensions can register via the exported API.
 */
export class ConnectionProviderRegistry {
	private readonly providers = new Map<string, IConnectionProvider>();
	private readonly _onProvidersChanged =
		new vscode.EventEmitter<IConnectionProvider[]>();

	/** Fires when providers are added or removed */
	readonly onProvidersChanged = this._onProvidersChanged.event;

	/**
	 * Register a connection provider.
	 * @returns A disposable that unregisters the provider when disposed.
	 */
	registerProvider(provider: IConnectionProvider): ProviderRegistration {
		if (
			!provider ||
			typeof provider.id !== 'string' || provider.id.length === 0 ||
			!Array.isArray(provider.providerTypes) || provider.providerTypes.length === 0 ||
			provider.providerTypes.some((t) => typeof t !== 'string') ||
			typeof provider.getConfigurationFields !== 'function' ||
			typeof provider.testConnection !== 'function' ||
			typeof provider.createClient !== 'function'
		) {
			throw new Error(
				'Invalid connection provider: id, providerTypes, getConfigurationFields, testConnection and createClient are required.'
			);
		}
		if (this.providers.has(provider.id)) {
			throw new Error(
				`Connection provider "${provider.id}" is already registered.`
			);
		}
		this.providers.set(provider.id, provider);
		this._onProvidersChanged.fire(this.getAllProviders());

		return new vscode.Disposable(() => {
			if (this.providers.get(provider.id) !== provider) {return;}
			this.providers.delete(provider.id);
			this._onProvidersChanged.fire(this.getAllProviders());
		});
	}

	/** Get a provider by its ID */
	getProvider(id: string): IConnectionProvider | undefined {
		return this.providers.get(id);
	}

	/** Get the provider that handles a given provider type */
	getProviderForType(
		providerType: ConnectionProviderType
	): IConnectionProvider | undefined {
		for (const provider of this.providers.values()) {
			if (provider.providerTypes.includes(providerType)) {
				return provider;
			}
		}
		return undefined;
	}

	/** Get all registered providers */
	getAllProviders(): IConnectionProvider[] {
		return Array.from(this.providers.values());
	}

	/** Test a connection using its provider */
	async testConnection(
		profile: ConnectionProfile,
		secret?: string
	): Promise<ConnectionTestResult> {
		const provider = this.getProviderForType(profile.providerType);
		if (!provider) {
			return {
				success: false,
				message: `No provider registered for type "${profile.providerType}"`,
			};
		}
		try {
			return await provider.testConnection(profile, secret);
		} catch (error: unknown) {
			return {
				success: false,
				message: redactSecretsInText(error instanceof Error ? error.message : String(error)),
			};
		}
	}

	/** Create a client for a connection */
	async createClient(
		profile: ConnectionProfile,
		secret?: string
	): Promise<unknown> {
		const provider = this.getProviderForType(profile.providerType);
		if (!provider) {
			throw new Error(
				`No provider registered for type "${profile.providerType}"`
			);
		}
		return provider.createClient(profile, secret);
	}

	dispose(): void {
		this._onProvidersChanged.dispose();
	}
}
