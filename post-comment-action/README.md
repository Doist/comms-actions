# `post-comment-action`

Posts a Markdown comment to an existing Comms thread using
[`todoist/comms-sdk-typescript`](https://github.com/todoist/comms-sdk-typescript).

## Usage

```yaml
- name: Post Comms thread comment
  uses: todoist/comms-actions/post-comment-action@aeeefe3270ad30d0c4cdd7dbf94b2fac1dcb8ceb
  with:
      comms-client-id: ${{ secrets.COMMS_CLIENT_ID }}
      comms-client-secret: ${{ secrets.COMMS_CLIENT_SECRET }}
      comms-username: ${{ secrets.COMMS_USERNAME }}
      comms-password: ${{ secrets.COMMS_PASSWORD }}
      workspace-id: 123
      thread-id: 7YpL3oZ4kZ9vP7Q1tR2sX44
      content: |
          The deployment completed successfully.
      audience: channel
```

Use the `todoist` owner after the GitHub organization rename. The example pins
the existing action commit; it does not require a new tag or package release.

## Organization migration

The owner change preserves the action's inputs, outputs, authentication, and
existing committed bundle. The usage example pins that working bootstrap
revision independently of SDK publication.

The source migration targets `@todoist/comms-sdk@4.0.1`, an intended release that
is not yet published. **WAITING_FOR_PUBLICATION: do not merge this SDK change.**
The lockfile and committed bundle intentionally still contain
`@doist/comms-sdk@0.5.2`; they must be regenerated from the real new-scope package
before this migration is usable. No new action pin is ready yet.

SDK 4.x uses the `/api/v1.0/` endpoints instead of `/api/v1/` and validates
comment `threadId` values as base58 UUIDv7 before sending the POST. The action
still checks the thread's workspace first. Its public inputs, outputs, OAuth
endpoint and scopes, empty recipient lists, and audience choices stay the same.
Mocked SDK transport tests cover the new request paths, notification payloads,
output URLs, and invalid IDs without calling Comms.

After the coordinator confirms the actual release and its dependencies:

```sh
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
npm run package
```

Review and commit the real lockfile and all generated files in `dist/` before
choosing a new immutable action pin. SDK 4.x can produce additional bundle
chunks; commit them together with `dist/index.js`. Verification with the old
scope is provisional and does not prove installation of the intended release.

## Inputs

| Input                 | Required | Description                                                               |
| --------------------- | :------: | ------------------------------------------------------------------------- |
| `workspace-id`        |   Yes    | Numeric Comms workspace ID. Used to validate the created comment.         |
| `thread-id`           |   Yes    | Existing Comms thread ID where the comment should be posted.              |
| `content`             |   Yes    | Markdown content for the comment.                                        |
| `audience`            |    No    | Optional notification audience. Use `channel` or `thread`.                |
| `comms-client-id`     |  Yes*    | Comms OAuth client ID. Falls back to `COMMS_CLIENT_ID`.                   |
| `comms-client-secret` |  Yes*    | Comms OAuth client secret. Falls back to `COMMS_CLIENT_SECRET`.           |
| `comms-username`      |  Yes*    | Comms username. Falls back to `COMMS_USERNAME`.                           |
| `comms-password`      |  Yes*    | Comms password. Falls back to `COMMS_PASSWORD`.                           |

*Required unless the corresponding environment variable fallback is set.

## Outputs

| Output         | Description                       |
| -------------- | --------------------------------- |
| `comment-id`   | ID of the created comment.        |
| `comment-url`  | Permalink to the created comment. |
| `thread-id`    | Thread ID returned by Comms.      |
| `workspace-id` | Workspace ID returned by Comms.   |
| `channel-id`   | Channel ID returned by Comms.     |

## Authentication

The action uses the OAuth password grant: each run exchanges `comms-client-id`,
`comms-client-secret`, `comms-username`, and `comms-password` for a fresh access
token with `scope=comms:content:read comms:content:write` and `resource` set to
`https://comms.todoist.com`.

Refresh tokens are intentionally not supported by this action. GitHub Action
runs are stateless, so the action itself has no durable, concurrency-safe place
to persist rotated refresh tokens between runs.

By default, the action posts with empty `recipients` and `groups` arrays and
does not notify an additional audience. Set `audience: channel` to notify
everyone in the channel, or `audience: thread` to notify everyone who has
interacted with the thread.

## Development

```sh
npm install
npm test
npm run build
npm run package
```
