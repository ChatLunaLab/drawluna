import { ImageAdapterType } from './adapters/base'

export interface ImageConfig<
    T extends keyof ImageAdapterType = keyof ImageAdapterType
> {
    index: number
    type: T
    url: string
    headers?: Record<string, string>
    config: T extends 'openai'
        ? OpenAIConfig
        : T extends 'doubao'
          ? DoubaoConfig
          : BaseImageConfig
}

export interface BaseImageConfig {
    apiKey: string
    timeout?: number
    retryCount?: number
}

export interface OpenAIConfig extends BaseImageConfig {
    defaultModel?: 'dall-e-2' | 'dall-e-3' | 'gpt-image-1'
    defaultEditModel?: 'dall-e-2' | 'dall-e-3' | 'gpt-image-1'
    defaultSize?: string
    defaultQuality?: string
    defaultStyle?: string
    defaultFormat?: string
}

export interface DoubaoConfig extends BaseImageConfig {
    accessKey: string
    secretKey: string
    region?: string
    service?: string
    defaultModel?: 'high_aes_general_v30l_zt2i' | 'seededit_v3.0'
    defaultEditModel?: 'seededit_v3.0'
    defaultSize?: string
    logoInfo?: DoubaoLogoInfo
}

export interface DoubaoLogoInfo {
    add_logo?: boolean
    position?: 0 | 1 | 2 | 3 // 0-右下角 1-左下角 2-左上角 3-右上角
    language?: 0 | 1 // 0-中文 1-英文
    opacity?: number // 0-1
    logo_text_content?: string
}

export interface OpenAIConfigItem {
    url: string
    headers: Record<string, string>
    apiKey: string
    defaultModel: 'dall-e-2' | 'dall-e-3' | 'gpt-image-1'
    defaultEditModel: 'dall-e-2' | 'dall-e-3' | 'gpt-image-1'
    defaultSize: string
    defaultQuality: string
    defaultStyle: string
    defaultFormat: string
    timeout: number
    retryCount: number
}

export interface DoubaoConfigItem {
    url: string
    accessKey: string
    secretKey: string
    region: string
    service: string
    defaultModel: 'high_aes_general_v30l_zt2i' | 'seededit_v3.0'
    defaultEditModel: 'seededit_v3.0'
    defaultSize: string
    timeout: number
    retryCount: number
    logoInfo: DoubaoLogoInfo
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
    // 豆包特有选项
    use_pre_llm?: boolean
    seed?: number
    scale?: number
    width?: number
    height?: number
    return_url?: boolean
    logo_info?: DoubaoLogoInfo
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
    seed?: number
    scale?: number
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

export interface DoubaoTaskSubmitResponse {
    code: number
    data: {
        task_id: string
    }
    message: string
    request_id: string
    status: number
    time_elapsed: string
}

export interface DoubaoTaskResultResponse {
    code: number
    data: {
        binary_data_base64?: string[]
        image_urls?: string[]
        response_data?: string
        status: 'in_queue' | 'generating' | 'done' | 'not_found' | 'expired'
    }
    message: string
    request_id: string
    status: number
    time_elapsed: string
}

export interface DoubaoGenerationOptions {
    req_key: string
    prompt: string
    use_pre_llm?: boolean
    seed?: number
    scale?: number
    width?: number
    height?: number
    return_url?: boolean
    logo_info?: DoubaoLogoInfo
}

export interface DoubaoEditOptions {
    req_key: string
    binary_data_base64?: string[]
    image_urls?: string[]
    prompt: string
    seed?: number
    scale?: number
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
