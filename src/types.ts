export interface ImageConfig<T extends 'openai' = 'openai'> {
    index: number
    type: T
    url: string
    headers?: Record<string, string>
    config: T extends 'openai' ? OpenAIConfig : BaseImageConfig
}

export interface BaseImageConfig {
    apiKey: string
    timeout?: number
    retryCount?: number
}

export interface OpenAIConfig extends BaseImageConfig {
    defaultModel?: 'dall-e-2' | 'dall-e-3' | 'gpt-image-1'
    defaultSize?: string
    defaultQuality?: string
    defaultStyle?: string
    defaultFormat?: string
}

export interface OpenAIConfigItem {
    url: string
    headers: Record<string, string>
    apiKey: string
    defaultModel: 'dall-e-2' | 'dall-e-3' | 'gpt-image-1'
    defaultSize: string
    defaultQuality: string
    defaultStyle: string
    defaultFormat: string
    timeout: number
    retryCount: number
}

export interface ImageGenerationOptions {
    prompt: string
    model?: string
    size?: string
    quality?: string
    style?: string
    n?: number
    background?: 'transparent' | 'opaque' | 'auto'
    moderation?: 'low' | 'auto'
    output_compression?: number
    output_format?: 'png' | 'jpeg' | 'webp'
    response_format?: 'url' | 'b64_json'
    user?: string
}

export interface ImageEditOptions {
    image: string | Buffer[]
    prompt: string
    mask?: string | Buffer | File
    model?: string
    n?: number
    size?: string
    quality?: string
    background?: 'transparent' | 'opaque' | 'auto'
    output_compression?: number
    output_format?: 'png' | 'jpeg' | 'webp'
    response_format?: 'url' | 'b64_json'
    user?: string
}

export interface ImageVariationOptions {
    image: string | Buffer | File
    model?: string
    n?: number
    size?: string
    response_format?: 'url' | 'b64_json'
    user?: string
}

export interface ImageGenerationResponse {
    created: number
    data: {
        url?: string
        b64_json?: string
        revised_prompt?: string
    }[]
    background?: string
    output_format?: string
    size?: string
    quality?: string
    usage?: {
        total_tokens: number
        input_tokens: number
        output_tokens: number
        input_tokens_details?: {
            text_tokens: number
            image_tokens: number
        }
    }
}

export type ImageOperation = 'generate' | 'edit' | 'variation'

export interface RetryResult<T> {
    success: boolean
    result?: T
    errors: {
        configIndex: number
        error: string
    }[]
    usedConfigIndex?: number
}

export interface ModelFilterOptions {
    model?: string
    operation?: ImageOperation
    fallbackToDefault?: boolean
}
