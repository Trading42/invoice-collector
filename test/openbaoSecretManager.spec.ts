import { AxiosInstance } from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Secret } from '../src/model/secret';
import { OpenBaoSecretManager } from '../src/secret_manager/openbaoSecretManager';

describe('OpenBaoSecretManager', () => {
    let temporaryDirectory: string;
    let tokenFile: string;
    let request: jest.Mock;
    let client: AxiosInstance;
    let environment: Record<string, string>;

    beforeEach(() => {
        temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-collector-openbao-'));
        tokenFile = path.join(temporaryDirectory, 'token');
        fs.writeFileSync(tokenFile, 'synthetic-openbao-token', { mode: 0o600 });
        request = jest.fn();
        client = { request } as unknown as AxiosInstance;
        environment = {
            SECRET_MANAGER_OPENBAO_ADDR: 'https://openbao.example.test',
            SECRET_MANAGER_OPENBAO_TOKEN_FILE: tokenFile,
            SECRET_MANAGER_OPENBAO_KV_MOUNT: 'secret',
            SECRET_MANAGER_OPENBAO_PREFIX: 'invoice-collector/testing',
        };
    });

    afterEach(() => {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
        jest.restoreAllMocks();
    });

    it('writes a KV v2 secret without placing the token in the path or payload', async () => {
        request.mockResolvedValue({ data: {} });
        const manager = new OpenBaoSecretManager(environment, client);
        const secret = new Secret('user_collector', {
            params: { email: 'test@example.test', password: 'private' },
            cookies: null,
            localStorage: null,
        });

        await manager.createSecret(secret);

        expect(secret.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(request).toHaveBeenCalledTimes(1);
        const config = request.mock.calls[0][0];
        expect(config.method).toBe('POST');
        expect(config.url).toBe(
            `/v1/secret/data/invoice-collector/testing/${secret.id}`,
        );
        expect(config.headers['X-Vault-Token']).toBe('synthetic-openbao-token');
        expect(config.data.data.key).toBe('user_collector');
        expect(config.data.data.value.params.password).toBe('private');
        expect(JSON.stringify(config.data)).not.toContain('synthetic-openbao-token');
        expect(config.maxRedirects).toBe(0);
        expect(config.proxy).toBe(false);
    });

    it('reads the token file for every request so an agent can rotate it', async () => {
        request.mockResolvedValue({
            data: { data: { data: { value: { params: { email: 'test@example.test' } } } } },
        });
        const manager = new OpenBaoSecretManager(environment, client);
        fs.writeFileSync(tokenFile, 'rotated-openbao-token', { mode: 0o600 });

        const value = await manager.getValue('12345678-1234-4234-8234-123456789abc');

        expect(value.params.email).toBe('test@example.test');
        expect(request.mock.calls[0][0].headers['X-Vault-Token']).toBe(
            'rotated-openbao-token',
        );
    });

    it('deletes KV v2 metadata rather than only one data version', async () => {
        request.mockResolvedValue({ data: {} });
        const manager = new OpenBaoSecretManager(environment, client);

        await manager.deleteSecret('12345678-1234-4234-8234-123456789abc');

        expect(request.mock.calls[0][0]).toMatchObject({
            method: 'DELETE',
            url: '/v1/secret/metadata/invoice-collector/testing/12345678-1234-4234-8234-123456789abc',
        });
    });

    it('rejects plaintext remote OpenBao addresses', () => {
        environment.SECRET_MANAGER_OPENBAO_ADDR = 'http://openbao.example.test';

        expect(() => new OpenBaoSecretManager(environment, client)).toThrow(
            'OpenBao must use HTTPS',
        );
    });
});
