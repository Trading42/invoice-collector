import fs from 'fs';
import path from 'path';

type BootstrapEnvironment = Record<string, string | undefined>;

/**
 * Persist the first customer API bearer without exposing it in container logs.
 * Production requires an absolute target in a pre-created private directory.
 * Debug runs may omit the file and retain the legacy console-only bootstrap.
 */
export function writeBootstrapCustomerBearer(
    bearer: string,
    environment: BootstrapEnvironment = process.env,
): string | null {
    const configuredPath = environment.BOOTSTRAP_CUSTOMER_BEARER_FILE?.trim();
    const debug = (environment.ENV || 'prod').toLowerCase() === 'debug';

    if (!configuredPath) {
        if (debug) {
            return null;
        }
        throw new Error(
            'BOOTSTRAP_CUSTOMER_BEARER_FILE is required before creating the first customer',
        );
    }
    if (!path.isAbsolute(configuredPath)) {
        throw new Error('BOOTSTRAP_CUSTOMER_BEARER_FILE must be absolute');
    }
    if (!bearer || /[\r\n]/.test(bearer) || Buffer.byteLength(bearer) > 16384) {
        throw new Error('Refusing to persist an invalid bootstrap bearer');
    }

    const target = path.resolve(configuredPath);
    const parent = path.dirname(target);
    const parentStatus = fs.lstatSync(parent);
    if (!parentStatus.isDirectory() || parentStatus.isSymbolicLink()) {
        throw new Error('The bootstrap bearer parent must be a non-linked directory');
    }
    if (process.platform !== 'win32' && (parentStatus.mode & 0o077) !== 0) {
        throw new Error('The bootstrap bearer parent must not be accessible by group or others');
    }

    const descriptor = fs.openSync(
        target,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
        0o600,
    );
    try {
        fs.writeFileSync(descriptor, `${bearer}\n`, { encoding: 'utf8' });
        if (process.platform !== 'win32') {
            fs.fchmodSync(descriptor, 0o600);
        }
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    return target;
}

/** Remove only the regular bootstrap file created for a failed DB transaction. */
export function removeBootstrapCustomerBearer(target: string): void {
    const status = fs.lstatSync(target);
    if (!status.isFile() || status.isSymbolicLink()) {
        throw new Error('Refusing to remove a non-regular bootstrap bearer path');
    }
    fs.unlinkSync(target);
}
