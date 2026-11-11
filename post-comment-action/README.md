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
committed `dist/index.js` bundle. The bundle and lockfile still use
`@doist/comms-sdk@0.5.2` intentionally so shared CI can transition independently
of SDK publication.

Migrating to `@todoist/comms-sdk` is a separate follow-up after its new-scope
release and dependencies are available. That change must review SDK API
compatibility, update the source and test imports, regenerate the lockfile from
the registry, run the tests and build, and regenerate the committed bundle.
The owner change alone does not complete the package migration.

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
