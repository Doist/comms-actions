import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { generateId, type CreateCommentArgs } from '@doist/comms-sdk'

import { runAction } from './main'

const originalEnv = { ...process.env }
const originalExitCode = process.exitCode

afterEach(() => {
    process.env = { ...originalEnv }
    process.exitCode = originalExitCode
})

test('posts a comment and closes the API client', async () => {
    const threadId = generateId()
    const commentId = generateId()
    const calls: CreateCommentArgs[] = []
    let closed = false

    setAuthInputs()
    process.env['INPUT_WORKSPACE-ID'] = '123'
    process.env['INPUT_THREAD-ID'] = threadId
    process.env['INPUT_CONTENT'] = 'Deployment completed.'

    await runAction({
        fetch: tokenFetch(),
        createCommsApi: (token) => {
            assert.equal(token, 'fresh-token')

            return {
                comments: {
                    createComment: async (args) => {
                        calls.push(args)
                        return {
                            id: commentId,
                            workspaceId: 123,
                            channelId: 'channel-id',
                            threadId,
                        }
                    },
                },
                close: async () => {
                    closed = true
                },
            }
        },
    })

    assert.deepEqual(calls, [
        {
            threadId,
            content: 'Deployment completed.',
            recipients: [],
            groups: [],
        },
    ])
    assert.equal(closed, true)
})

test('supports notifying everyone in the channel', async () => {
    const threadId = generateId()
    const calls: CreateCommentArgs[] = []

    setAuthInputs()
    process.env['INPUT_WORKSPACE-ID'] = '123'
    process.env['INPUT_THREAD-ID'] = threadId
    process.env['INPUT_CONTENT'] = 'Deployment completed.'
    process.env['INPUT_AUDIENCE'] = 'channel'

    await runAction({
        fetch: tokenFetch(),
        createCommsApi: () => ({
            comments: {
                createComment: async (args) => {
                    calls.push(args)
                    return {
                        id: generateId(),
                        workspaceId: 123,
                        channelId: 'channel-id',
                        threadId,
                    }
                },
            },
            close: async () => undefined,
        }),
    })

    assert.deepEqual(calls, [
        {
            threadId,
            content: 'Deployment completed.',
            recipients: [],
            groups: [],
            notifyAudience: 'channel',
        },
    ])
})

test('uses password grant auth', async () => {
    const threadId = generateId()
    const tokenRequests: Array<{ url: string; body: Record<string, string> }> = []

    setAuthInputs()
    process.env['INPUT_WORKSPACE-ID'] = '123'
    process.env['INPUT_THREAD-ID'] = threadId
    process.env['INPUT_CONTENT'] = 'Deployment completed.'

    await runAction({
        fetch: tokenFetch(tokenRequests),
        createCommsApi: (token) => {
            assert.equal(token, 'fresh-token')

            return {
                comments: {
                    createComment: async () => ({
                        id: generateId(),
                        workspaceId: 123,
                        channelId: 'channel-id',
                        threadId,
                    }),
                },
                close: async () => undefined,
            }
        },
    })

    assert.deepEqual(tokenRequests, [
        {
            url: 'https://app.todoist.com/oauth/access_token',
            body: {
                grant_type: 'password',
                client_id: 'client-id',
                client_secret: 'client-secret',
                username: 'user@example.com',
                password: 'password',
                scope: 'comms:content:write',
                resource: 'https://comms.todoist.com',
            },
        },
    ])
})

test('rejects partial password grant credentials', async () => {
    process.env['INPUT_COMMS-CLIENT-ID'] = 'client-id'
    process.env['INPUT_WORKSPACE-ID'] = '123'
    process.env['INPUT_THREAD-ID'] = generateId()
    process.env['INPUT_CONTENT'] = 'Deployment completed.'

    await assert.rejects(
        () => runAction(),
        /Missing Comms OAuth input\(s\): comms-client-secret, comms-username, comms-password\./,
    )
})

test('rejects invalid workspace IDs', async () => {
    process.env['INPUT_WORKSPACE-ID'] = 'abc'
    process.env['INPUT_THREAD-ID'] = generateId()
    process.env['INPUT_CONTENT'] = 'Deployment completed.'

    await assert.rejects(() => runAction(), /workspace-id must be a positive integer./)
})

test('rejects comments created in a different workspace', async () => {
    const threadId = generateId()

    setAuthInputs()
    process.env['INPUT_WORKSPACE-ID'] = '123'
    process.env['INPUT_THREAD-ID'] = threadId
    process.env['INPUT_CONTENT'] = 'Deployment completed.'

    await assert.rejects(
        () =>
            runAction({
                fetch: tokenFetch(),
                createCommsApi: () => ({
                    comments: {
                        createComment: async () => ({
                            id: generateId(),
                            workspaceId: 456,
                            channelId: 'channel-id',
                            threadId,
                        }),
                    },
                    close: async () => undefined,
                }),
            }),
        /Created comment workspace ID 456 did not match requested workspace ID 123./,
    )
})

test('rejects unknown audiences', async () => {
    process.env['INPUT_WORKSPACE-ID'] = '123'
    process.env['INPUT_THREAD-ID'] = generateId()
    process.env['INPUT_CONTENT'] = 'Deployment completed.'
    process.env['INPUT_AUDIENCE'] = 'everyone'

    await assert.rejects(
        () => runAction(),
        /Invalid audience. Expected "channel" or "thread"./,
    )
})

function setAuthInputs(): void {
    process.env['INPUT_COMMS-CLIENT-ID'] = 'client-id'
    process.env['INPUT_COMMS-CLIENT-SECRET'] = 'client-secret'
    process.env['INPUT_COMMS-USERNAME'] = 'user@example.com'
    process.env['INPUT_COMMS-PASSWORD'] = 'password'
}

function tokenFetch(
    requests?: Array<{ url: string; body: Record<string, string> }>,
): typeof fetch {
    return async (input, init) => {
        requests?.push({
            url: String(input),
            body: Object.fromEntries(new URLSearchParams(String(init?.body))),
        })

        return new Response(JSON.stringify({ access_token: 'fresh-token' }), { status: 200 })
    }
}
