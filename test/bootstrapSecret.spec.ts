import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    removeBootstrapCustomerBearer,
    writeBootstrapCustomerBearer,
} from '../src/security/bootstrapSecret';

describe('bootstrap customer bearer', () => {
    let temporaryDirectory: string;

    beforeEach(() => {
        temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-collector-bootstrap-'));
        if (process.platform !== 'win32') {
            fs.chmodSync(temporaryDirectory, 0o700);
        }
    });

    afterEach(() => {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    });

    it('writes a new bearer file with private POSIX permissions', () => {
        const target = path.join(temporaryDirectory, 'customer-bearer');

        const result = writeBootstrapCustomerBearer('synthetic-admin-bearer', {
            ENV: 'prod',
            BOOTSTRAP_CUSTOMER_BEARER_FILE: target,
        });

        expect(result).toBe(target);
        expect(fs.readFileSync(target, 'utf8')).toBe('synthetic-admin-bearer\n');
        if (process.platform !== 'win32') {
            expect(fs.statSync(target).mode & 0o777).toBe(0o600);
        }
    });

    it('will not overwrite an existing path', () => {
        const target = path.join(temporaryDirectory, 'customer-bearer');
        fs.writeFileSync(target, 'keep-me');

        expect(() => writeBootstrapCustomerBearer('replacement', {
            ENV: 'prod',
            BOOTSTRAP_CUSTOMER_BEARER_FILE: target,
        })).toThrow();
        expect(fs.readFileSync(target, 'utf8')).toBe('keep-me');
    });

    it('requires a configured file outside debug mode', () => {
        expect(() => writeBootstrapCustomerBearer('synthetic', { ENV: 'prod' }))
            .toThrow('BOOTSTRAP_CUSTOMER_BEARER_FILE is required');
        expect(writeBootstrapCustomerBearer('synthetic', { ENV: 'debug' })).toBeNull();
    });

    it('removes only the regular file returned by the writer', () => {
        const target = path.join(temporaryDirectory, 'customer-bearer');
        writeBootstrapCustomerBearer('synthetic', {
            ENV: 'prod',
            BOOTSTRAP_CUSTOMER_BEARER_FILE: target,
        });

        removeBootstrapCustomerBearer(target);

        expect(fs.existsSync(target)).toBe(false);
    });
});
