import { h, Logger, Session } from 'koishi'
import { ImageConfig, RetryResult } from './types'

export function createRetryResult<T>(): RetryResult<T> {
    return {
        success: false,
        errors: []
    }
}

export async function retryWithConfigs<T>(
    configs: ImageConfig[],
    operation: (config: ImageConfig, index: number) => Promise<T>,
    logger?: Logger
): Promise<RetryResult<T>> {
    const result = createRetryResult<T>()

    if (configs.length === 0) {
        result.errors.push({
            configIndex: -1,
            error: '没有可用的配置'
        })
        return result
    }

    for (let i = 0; i < configs.length; i++) {
        const config = configs[i]
        try {
            const operationResult = await operation(config, i)
            result.success = true
            result.result = operationResult
            result.usedConfigIndex = i

            if (logger && i > 0) {
                logger.info(`重试成功，使用配置索引 ${i}`)
            }

            return result
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            result.errors.push({
                configIndex: i,
                error: errorMessage
            })

            if (logger) {
                logger.warn(`配置索引 ${i} 执行失败: `, error)
            }
        }
    }

    return result
}

export function formatRetryErrors<T>(result: RetryResult<T>): string {
    if (result.success) return ''

    if (result.errors.length === 0) {
        return '未知错误'
    }

    if (result.errors.length === 1) {
        return result.errors[0].error
    }

    return `所有配置都失败了:\n${result.errors
        .map((e) => `配置 ${e.configIndex}: ${e.error}`)
        .join('\n')}`
}

export function validateImageSize(size: string, model: string): boolean {
    const validSizes: Record<string, string[]> = {
        'dall-e-2': ['256x256', '512x512', '1024x1024'],
        'dall-e-3': ['1024x1024', '1792x1024', '1024x1792'],
        'gpt-image-1': ['1024x1024', '1536x1024', '1024x1536', 'auto']
    }

    return validSizes[model]?.includes(size) || false
}

export function validateImageQuality(quality: string, model: string): boolean {
    const validQualities: Record<string, string[]> = {
        'dall-e-2': ['standard'],
        'dall-e-3': ['standard', 'hd'],
        'gpt-image-1': ['auto', 'high', 'medium', 'low']
    }

    return validQualities[model]?.includes(quality) || false
}

export function isHttpError(
    error: Error & { response?: { status: number }; status?: number }
): boolean {
    return !!(error?.response?.status || error?.status)
}

export function getErrorMessage(
    error: Error & { response?: { data?: { error?: { message: string } } } }
): string {
    if (error?.response?.data?.error?.message) {
        return error.response.data.error.message
    }

    if (error?.message) {
        return error.message
    }

    return String(error)
}

export function shouldRetry(
    error: Error & { response?: { status: number }; status?: number }
): boolean {
    if (!isHttpError(error)) {
        return true
    }

    const status = error?.response?.status || error?.status

    // 不重试的状态码：认证错误、权限错误、客户端错误等
    const noRetryStatuses = [400, 401, 403, 404, 422]

    return !noRetryStatuses.includes(status)
}

export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetryDelay<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error & { response?: { status: number }; status?: number }

    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await operation()
        } catch (error) {
            lastError = error

            if (i === maxRetries || !shouldRetry(error)) {
                break
            }

            const delayTime = baseDelay * Math.pow(2, i)
            await delay(delayTime)
        }
    }

    throw lastError
}

export async function handleImageUpload<T>(
    session: Session,
    content: string,
    handler: (imageData: Buffer[]) => Promise<T>
) {
    let elements = h.select(session.elements, 'img')

    if (elements.length === 0) {
        elements = h.select(h.parse(content), 'img')
    }

    if (elements.length === 0) {
        elements = h.select(session.quote?.elements ?? [], 'img')
    }

    if (elements.length === 0) {
        throw new Error('没有找到图片')
    }

    const images: Buffer[] = []

    const readImage = async (url: string) => {
        const response = await session.app.http(url, {
            responseType: 'arraybuffer',
            method: 'get',
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
            }
        })

        // support any text
        let ext = url.match(/\.([^.]*)$/)?.[1]

        if (!['png', 'jpeg'].includes(ext)) {
            ext = 'jpeg'
        }

        const buffer = response.data

        images.push(Buffer.from(buffer))
    }

    for (const element of elements) {
        const url = (element.attrs.url ?? element.attrs.src) as string

        if (url.startsWith('data:image') && url.includes('base64')) {
            const base64 = url.split(',')[1]
            images.push(Buffer.from(base64, 'base64'))
        } else {
            try {
                await readImage(url)
            } catch (error) {
                session.app.logger.warn(
                    `read image ${url} error, check your chat adapter`,
                    error
                )
            }
        }
    }

    return await handler(images)
}
