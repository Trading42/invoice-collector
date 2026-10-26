import axios from 'axios';
import { CompleteInvoice, Config } from '../src/collectors/abstractCollector';
import { HttpIntegration } from '../src/integration/httpIntegration';
import { Secret } from '../src/model/secret';
import * as utils from '../src/utils';

describe('HttpIntegration authentication', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('sends an optional Bearer header without adding the token to the URL', async () => {
        jest.spyOn(utils, 'assertPublicHttpsUrl').mockResolvedValue();
        const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200 });
        const integration = new HttpIntegration(new Secret('callback', {
            params: {
                url: 'https://konta.example.test/callback',
                authorization_bearer: 'synthetic-callback-token',
            },
        }));
        const invoice = {
            id: 'invoice-1',
            timestamp: Date.now(),
            link: 'https://vendor.example.test/invoice-1',
            data: 'JVBERi0=',
            mimetype: 'application/pdf',
            hash: null,
            collected_timestamp: Date.now(),
            downloadButton: null,
            metadata: {},
        } as CompleteInvoice;

        await integration.sendInvoice({ id: 'vendor' } as Config, 'remote-user', invoice);

        expect(post).toHaveBeenCalledTimes(1);
        expect(post.mock.calls[0][0]).toBe('https://konta.example.test/callback');
        expect(post.mock.calls[0][2]).toMatchObject({
            headers: { Authorization: 'Bearer synthetic-callback-token' },
            maxRedirects: 0,
            proxy: false,
            timeout: 30000,
        });
        expect(post.mock.calls[0][0]).not.toContain('synthetic-callback-token');
    });

    it('keeps existing callbacks working when no Bearer token is configured', async () => {
        jest.spyOn(utils, 'assertPublicHttpsUrl').mockResolvedValue();
        const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200 });
        const integration = new HttpIntegration(new Secret('callback', {
            params: { url: 'https://konta.example.test/callback' },
        }));
        const invoice = {
            id: 'invoice-2',
            timestamp: Date.now(),
            link: 'https://vendor.example.test/invoice-2',
            data: 'JVBERi0=',
            mimetype: 'application/pdf',
            hash: null,
            collected_timestamp: Date.now(),
            downloadButton: null,
            metadata: {},
        } as CompleteInvoice;

        await integration.sendInvoice({ id: 'vendor' } as Config, 'remote-user', invoice);

        expect(post.mock.calls[0][2]).toMatchObject({
            maxRedirects: 0,
            proxy: false,
            timeout: 30000,
        });
        expect(post.mock.calls[0][2]?.headers).toBeUndefined();
    });
});
