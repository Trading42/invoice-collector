import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Secret } from '../model/secret';
import { AbstractSecretManager } from './abstractSecretManager';

type OpenBaoEnvironment = Record<string, string | undefined>;

export class OpenBaoSecretManager extends AbstractSecretManager {

    static readonly DEFAULT_TIMEOUT_MS = 10000;
    static readonly MAX_TOKEN_FILE_BYTES = 16384;
    static readonly SECRET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    private readonly address: string;
    private readonly tokenFile: string;
    private readonly mount: string;
    private readonly prefix: string[];
    private readonly namespace: string | undefined;
    private readonly client: AxiosInstance;

    constructor(
        environment: OpenBaoEnvironment = process.env,
        client?: AxiosInstance,
    ) {
        super();
        this.address = OpenBaoSecretManager.validateAddress(
            OpenBaoSecretManager.requiredEnvironment(environment, 'SECRET_MANAGER_OPENBAO_ADDR'),
        );
        this.tokenFile = path.resolve(
            OpenBaoSecretManager.requiredEnvironment(
                environment,
                'SECRET_MANAGER_OPENBAO_TOKEN_FILE',
            ),
        );
        this.mount = OpenBaoSecretManager.validateSegment(
            environment.SECRET_MANAGER_OPENBAO_KV_MOUNT || 'secret',
            'KV mount',
        );
        this.prefix = OpenBaoSecretManager.validatePrefix(
            environment.SECRET_MANAGER_OPENBAO_PREFIX || 'invoice-collector',
        );
        this.namespace = environment.SECRET_MANAGER_OPENBAO_NAMESPACE?.trim() || undefined;
        if (this.namespace && /[\r\n]/.test(this.namespace)) {
            throw new Error('Invalid OpenBao namespace');
        }
        this.client = client || axios.create({
            baseURL: this.address,
            timeout: OpenBaoSecretManager.DEFAULT_TIMEOUT_MS,
            maxRedirects: 0,
            proxy: false,
        });
        this.readToken();
    }

    async connect(): Promise<void> {
        await this.ping();
    }

    async disconnect(): Promise<void> {
        // OpenBao uses stateless HTTP requests and has no client session to close.
    }

    async ping(): Promise<void> {
        try {
            await this.request({
                method: 'GET',
                url: '/v1/sys/health?standbyok=true&perfstandbyok=true',
            });
        } catch (err) {
            throw new Error('Could not reach OpenBao server', { cause: err });
        }
    }

    async getValue(id: string): Promise<any> {
        const secretId = OpenBaoSecretManager.validateSecretId(id);
        try {
            const response = await this.request({
                method: 'GET',
                url: this.secretUrl('data', secretId),
            });
            const value = response.data?.data?.data?.value;
            if (value === undefined) {
                throw new Error('OpenBao response did not contain a secret value');
            }
            return value;
        } catch (err) {
            throw new Error(`Failed to get secret ${secretId}`, { cause: err });
        }
    }

    async createSecret(secret: Secret): Promise<Secret> {
        const id = crypto.randomUUID();
        secret.id = id;
        try {
            await this.writeSecret(secret);
            return secret;
        } catch (err) {
            secret.id = '';
            throw new Error(`Failed to create secret ${secret.key}`, { cause: err });
        }
    }

    async updateSecret(secret: Secret): Promise<void> {
        try {
            await this.writeSecret(secret);
        } catch (err) {
            throw new Error(`Failed to update secret ${secret.id}`, { cause: err });
        }
    }

    async deleteSecret(id: string): Promise<void> {
        await this.deleteSecrets([id]);
    }

    async deleteSecrets(ids: string[]): Promise<void> {
        const secretIds = ids.map(OpenBaoSecretManager.validateSecretId);
        try {
            await Promise.all(secretIds.map((id) => this.request({
                method: 'DELETE',
                url: this.secretUrl('metadata', id),
            })));
        } catch (err) {
            throw new Error('Failed to delete OpenBao secrets', { cause: err });
        }
    }

    private async writeSecret(secret: Secret): Promise<void> {
        const secretId = OpenBaoSecretManager.validateSecretId(secret.id);
        await this.request({
            method: 'POST',
            url: this.secretUrl('data', secretId),
            data: {
                data: {
                    key: secret.key,
                    value: secret.value,
                },
            },
        });
    }

    private async request(config: AxiosRequestConfig): Promise<any> {
        const headers: Record<string, string> = {
            'X-Vault-Token': this.readToken(),
        };
        if (this.namespace) {
            headers['X-Vault-Namespace'] = this.namespace;
        }
        return this.client.request({
            ...config,
            headers: {
                ...config.headers,
                ...headers,
            },
            maxRedirects: 0,
            proxy: false,
        });
    }

    private readToken(): string {
        let fileStatus: fs.Stats;
        try {
            fileStatus = fs.lstatSync(this.tokenFile);
        } catch (err) {
            throw new Error('Unable to read the OpenBao token file', { cause: err });
        }
        if (!fileStatus.isFile() || fileStatus.isSymbolicLink()) {
            throw new Error('The OpenBao token path must be a regular, non-linked file');
        }
        if (fileStatus.size > OpenBaoSecretManager.MAX_TOKEN_FILE_BYTES) {
            throw new Error('The OpenBao token file is unexpectedly large');
        }
        if (process.platform !== 'win32' && (fileStatus.mode & 0o077) !== 0) {
            throw new Error('The OpenBao token file must not be accessible by group or others');
        }
        const token = fs.readFileSync(this.tokenFile, 'utf8').trim();
        if (!token || /[\r\n]/.test(token)) {
            throw new Error('The OpenBao token file is empty or invalid');
        }
        return token;
    }

    private secretUrl(endpoint: 'data' | 'metadata', id: string): string {
        const segments = [this.mount, endpoint, ...this.prefix, id]
            .map((segment) => encodeURIComponent(segment));
        return `/v1/${segments.join('/')}`;
    }

    private static requiredEnvironment(
        environment: OpenBaoEnvironment,
        name: string,
    ): string {
        const value = environment[name]?.trim();
        if (!value) {
            throw new Error(`Environment variable ${name} is required`);
        }
        return value;
    }

    private static validateAddress(value: string): string {
        let parsed: URL;
        try {
            parsed = new URL(value);
        } catch (err) {
            throw new Error('SECRET_MANAGER_OPENBAO_ADDR must be a valid URL', { cause: err });
        }
        const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
        if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
            throw new Error('OpenBao must use HTTPS except on loopback development hosts');
        }
        if (
            parsed.pathname !== '/'
            || parsed.search
            || parsed.hash
            || parsed.username
            || parsed.password
        ) {
            throw new Error('SECRET_MANAGER_OPENBAO_ADDR must be an origin without credentials');
        }
        return parsed.origin;
    }

    private static validateSegment(value: string, label: string): string {
        const candidate = value.trim();
        if (!/^[a-zA-Z0-9_-]+$/.test(candidate)) {
            throw new Error(`Invalid OpenBao ${label}`);
        }
        return candidate;
    }

    private static validatePrefix(value: string): string[] {
        const segments = value.split('/').filter(Boolean);
        if (segments.length === 0) {
            throw new Error('Invalid OpenBao secret prefix');
        }
        return segments.map((segment) => OpenBaoSecretManager.validateSegment(segment, 'prefix'));
    }

    private static validateSecretId(id: string): string {
        if (!OpenBaoSecretManager.SECRET_ID_PATTERN.test(id)) {
            throw new Error('Invalid OpenBao secret identifier');
        }
        return id;
    }
}
