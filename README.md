[![Join Invoice-Collector on Discord](https://img.shields.io/badge/Discord-Invoice--Collector-2e8555.svg?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/dMXTdpxMqY)

<p align="center">
  <img width="100%" src="https://github.com/invoice-collector/invoice-collector/raw/master/images/preview/preview.svg" />
</p>

# Invoice Collector

Invoice Collector is a free Docker image designed to retrieve invoices and receipts from suppliers. It seamlessly connects to customer portals, APIs, and email inboxes to automatically gather invoices.

<p align="center">
  <a href="https://app.invoice-collector.com/login" target="_blank">
    <img height="35px" src="https://img.shields.io/badge/Login-2e8555?style=for-the-badge" />
  </a>
  <a href="https://app.invoice-collector.com/signup" target="_blank">
    <img height="35px" src="https://img.shields.io/badge/Sign%20Up%20for%20free-ebedf0?style=for-the-badge" />
  </a>
</p>

## Prerequisits
- [Install docker engine](https://docs.docker.com/engine/install/)

## Installation

Use the [docker-compose.yml](https://github.com/invoice-collector/invoice-collector/blob/master/docker-compose.yml) file to build and run a container.

1. Download the `docker-compose.yml` file from Github repo.

```bash
curl https://raw.githubusercontent.com/invoice-collector/invoice-collector/refs/heads/master/docker-compose.yml >> docker-compose.yml
```

2. Edit the `docker-compose.yml` and set the values for the env variables.

For self-hosted deployments, `SECRET_MANAGER_TYPE=openbao` is also supported.
Use a KV v2 mount and provide the OpenBao token through a runtime-only file:

```dotenv
SECRET_MANAGER_TYPE=openbao
SECRET_MANAGER_OPENBAO_ADDR=https://openbao.example.internal
SECRET_MANAGER_OPENBAO_TOKEN_FILE=/run/secrets/openbao-token
SECRET_MANAGER_OPENBAO_KV_MOUNT=secret
SECRET_MANAGER_OPENBAO_PREFIX=invoice-collector
SECRET_MANAGER_OPENBAO_NAMESPACE=
```

The token file must be a regular non-linked file and mode `0600` on POSIX.
Plain HTTP is accepted only for loopback development endpoints. The OpenBao
client disables redirects and environment proxies. A minimal KV v2 policy needs
create/read/update access to `secret/data/invoice-collector/*` and delete access
to `secret/metadata/invoice-collector/*`.

The HTTP callback integration accepts an optional `authorization_bearer`
parameter. When set, callbacks include `Authorization: Bearer <token>`. The
token is stored by the configured secret manager and is never included in the
callback URL or success logs.

3. Build and run the container

```bash
sudo docker compose up -d
```

<!-- ## Usage -->
## Contribution

There are two ways you can contribute to Invoice-Collector:
- [Open a new issue to report a bug or request a new feature](https://github.com/invoice-collector/invoice-collector/issues/new/choose)
- Create a new collector for the benefit of all

## Developers

[Full documentation available on the website.](https://invoice-collector.com/docs/)

Here is how to configure the project on your local machine.

- Clone the repo
- Install Google Chrome
- Create a `.env` file with [all the required variables](https://invoice-collector.com/docs/developers/environment-variables)

**Run a manual test**
```bash
npm run test.manual
# Or
npm run test.manual <collector_id>
# Or
npm run test.manual <collector_id> <first_param>
# Or
npm run test.manual <collector_id> <first_param> <second_param> ...
```

**Run a automatic test**
```bash
npm run test.auto <collector_id>
```

**Run on your local machine**

```bash
npm run start
```

**Run the debug container**
```bash
docker-compose -f docker-compose-debug.yml up --build
```

You can then use the postman collection (_available soon_) to query the dev environment.

<!-- ## FAQ -->
