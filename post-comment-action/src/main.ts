import { appendFileSync } from 'node:fs'
import { EOL } from 'node:os'

import { CommsApi, getFullCommsURL, type CreateCommentArgs } from '@doist/comms-sdk'

const COMMS_BASE_URL = 'https://comms.todoist.com'
const TODOIST_OAUTH_URL = 'https://app.todoist.com/oauth/access_token'

type CommsCredentials = {
    clientId: string
    clientSecret: string
    username: string
    password: string
}

type CreatedComment = {
    id: string
    workspaceId: number
    channelId: string
    threadId: string
}

type CommsApiClient = {
    comments: {
        createComment(args: CreateCommentArgs): Promise<CreatedComment>
    }
    close(): Promise<void>
}

export type RunDependencies = {
    createCommsApi?: (token: string) => CommsApiClient
    fetch?: typeof fetch
}

export async function run(dependencies: RunDependencies = {}): Promise<void> {
    try {
        await runAction(dependencies)
    } catch (error: unknown) {
        setFailed(error instanceof Error ? error.message : String(error))
    }
}

export async function runAction(dependencies: RunDependencies = {}): Promise<void> {
    const workspaceId = getWorkspaceId()
    const threadId = getInput('thread-id', { required: true }).trim()
    const content = getInput('content', { required: true, trimWhitespace: false })
    const audience = getAudience()

    if (!content.trim()) {
        throw new Error('Comment content cannot be empty.')
    }

    const token = await getCommsToken(dependencies.fetch ?? fetch)
    const api = createApi(token, dependencies)

    try {
        const args: CreateCommentArgs = {
            threadId,
            content,
            recipients: [],
            groups: [],
        }

        if (audience) {
            args.notifyAudience = audience
        }

        const comment = await createComment(api, args)
        validateCommentWorkspace(comment, workspaceId)
        const commentUrl = getFullCommsURL(
            {
                workspaceId: comment.workspaceId,
                channelId: comment.channelId,
                threadId: comment.threadId,
                commentId: comment.id,
            },
        )

        setOutput('comment-id', comment.id)
        setOutput('comment-url', commentUrl)
        setOutput('thread-id', comment.threadId)
        setOutput('workspace-id', String(comment.workspaceId))
        setOutput('channel-id', comment.channelId)
        console.log(`Posted Comms comment ${comment.id}: ${commentUrl}`)
    } finally {
        await api.close()
    }
}

async function createComment(
    api: CommsApiClient,
    args: CreateCommentArgs,
): Promise<CreatedComment> {
    try {
        return await api.comments.createComment(args)
    } catch (error: unknown) {
        logErrorDetails('Comms comment creation failed', error)
        throw error
    }
}

function getWorkspaceId(): number {
    const value = getInput('workspace-id', { required: true }).trim()
    const workspaceId = Number(value)

    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
        throw new Error('workspace-id must be a positive integer.')
    }

    return workspaceId
}

function validateCommentWorkspace(comment: CreatedComment, workspaceId: number): void {
    if (comment.workspaceId !== workspaceId) {
        throw new Error(
            `Created comment workspace ID ${comment.workspaceId} did not match requested workspace ID ${workspaceId}.`,
        )
    }
}

function createApi(token: string, dependencies: RunDependencies): CommsApiClient {
    return dependencies.createCommsApi?.(token) ?? new CommsApi(token)
}

async function getCommsToken(fetchImpl: typeof fetch): Promise<string> {
    const clientId = getOptionalInput('comms-client-id') ?? process.env.COMMS_CLIENT_ID
    const clientSecret = getOptionalInput('comms-client-secret') ?? process.env.COMMS_CLIENT_SECRET
    const username = getOptionalInput('comms-username') ?? process.env.COMMS_USERNAME
    const password = getOptionalInput('comms-password') ?? process.env.COMMS_PASSWORD
    const credentials = requireCompleteCredentials({
        clientId,
        clientSecret,
        username,
        password,
    })
    const token = await getPasswordGrantToken(credentials, fetchImpl)

    setSecret(token)
    return token
}

function requireCompleteCredentials(values: {
    clientId?: string
    clientSecret?: string
    username?: string
    password?: string
}): CommsCredentials {
    const missing = [
        ['comms-client-id', values.clientId],
        ['comms-client-secret', values.clientSecret],
        ['comms-username', values.username],
        ['comms-password', values.password],
    ]
        .filter(([, value]) => !value)
        .map(([name]) => name)

    if (missing.length > 0) {
        throw new Error(`Missing Comms OAuth input(s): ${missing.join(', ')}.`)
    }

    for (const secret of [
        values.clientId,
        values.clientSecret,
        values.username,
        values.password,
    ]) {
        setSecret(secret as string)
    }

    return values as CommsCredentials
}

async function getPasswordGrantToken(
    credentials: CommsCredentials,
    fetchImpl: typeof fetch,
): Promise<string> {
    const response = await fetchImpl(TODOIST_OAUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'password',
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            username: credentials.username,
            password: credentials.password,
            scope: 'comms:content:write',
            resource: COMMS_BASE_URL,
        }),
    })
    const responseText = await response.text()
    const body = parseJsonObject(responseText) as {
        access_token?: string
        accessToken?: string
    }
    const token = body.access_token ?? body.accessToken

    if (!response.ok) {
        throw new Error(
            `Comms OAuth token request failed with status ${response.status}: ${formatResponseBody(responseText)}.`,
        )
    }

    if (!token) {
        throw new Error('Comms OAuth token response did not contain an access token.')
    }

    return token
}

function parseJsonObject(value: string): unknown {
    try {
        return value ? JSON.parse(value) : {}
    } catch {
        return {}
    }
}

function formatResponseBody(value: string): string {
    const normalized = value.trim()

    if (!normalized) {
        return '<empty response body>'
    }

    return normalized.length > 1000 ? `${normalized.slice(0, 1000)}...` : normalized
}

function logErrorDetails(label: string, error: unknown): void {
    const details = error as {
        httpStatusCode?: unknown
        responseData?: unknown
        message?: unknown
        name?: unknown
    }

    console.error(label)

    if (details.name) {
        console.error(`Error name: ${String(details.name)}`)
    }

    if (details.message) {
        console.error(`Error message: ${String(details.message)}`)
    }

    if (details.httpStatusCode !== undefined) {
        console.error(`HTTP status: ${String(details.httpStatusCode)}`)
    }

    if (details.responseData !== undefined) {
        console.error(`Response data: ${formatResponseBody(JSON.stringify(details.responseData))}`)
    }
}

function getAudience(): CreateCommentArgs['notifyAudience'] | undefined {
    const audience = getOptionalInput('audience')

    if (!audience) {
        return undefined
    }

    if (audience === 'channel' || audience === 'thread') {
        return audience
    }

    throw new Error('Invalid audience. Expected "channel" or "thread".')
}

function getOptionalInput(name: string): string | undefined {
    const value = getInput(name).trim()

    return value || undefined
}

function getInput(
    name: string,
    options: { required?: boolean; trimWhitespace?: boolean } = {},
): string {
    const value = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? ''
    const result = options.trimWhitespace === false ? value : value.trim()

    if (options.required && !result) {
        throw new Error(`Missing required input: ${name}.`)
    }

    return result
}

function setOutput(name: string, value: string): void {
    const outputPath = process.env.GITHUB_OUTPUT

    if (outputPath) {
        appendFileSync(outputPath, `${name}=${value}${EOL}`)
    }
}

function setSecret(value: string): void {
    console.log(`::add-mask::${escapeCommandValue(value)}`)
}

function setFailed(message: string): void {
    console.error(message)
    process.exitCode = 1
}

function escapeCommandValue(value: string): string {
    return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

if (require.main === module) {
    void run()
}
