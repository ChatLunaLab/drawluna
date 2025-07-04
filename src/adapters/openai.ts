import { ImageAdapter } from './base'
import { Context, Session } from 'koishi'
import {
    ImageConfig,
    ImageGenerationOptions,
    ImageEditOptions,
    ImageVariationOptions,
    ImageGenerationResponse,
    OpenAIConfig
} from '../types'
import FormData from 'form-data'

export class OpenAIAdapter extends ImageAdapter<'openai'> {
    type = 'openai' as const

    constructor(ctx: Context) {
        super(ctx)
    }

    protected async _getModels(
        config: ImageConfig<'openai'>
    ): Promise<string[]> {
        const models = this.getDefaultModels()

        this.ctx.logger.error(config)
        const response = await this.ctx.http<{
            data: { object: 'list'; id: string }[]
        }>(`${config.url}/models`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${config.config.apiKey}`
            }
        })

        if (response.status !== 200) {
            throw new Error(
                JSON.stringify(response.data || response.statusText)
            )
        }

        try {
            return response.data.data
                .map((item) => item.id)
                .filter((model) => models.includes(model))
        } catch (error) {
            this.ctx.logger.error(error)
            return models
        }
    }

    protected getDefaultModels(): string[] {
        return [
            'dall-e-2',
            'dall-e-3',
            'gpt-image-1',
            'ideogram',
            'flux',
            'stable-diffusion'
        ]
    }

    async generateImage(
        config: ImageConfig<'openai'>,
        options: ImageGenerationOptions,
        session?: Session
    ): Promise<ImageGenerationResponse> {
        const openaiConfig = config.config

        const requestData = this.buildGenerationRequest(options, openaiConfig)

        const response = await this.ctx.http<ImageGenerationResponse>(
            `${config.url}/images/generations`,
            {
                method: 'POST',
                data: requestData,
                headers: {
                    Authorization: `Bearer ${openaiConfig.apiKey}`,
                    'Content-Type': 'application/json',
                    ...config.headers
                },
                timeout: openaiConfig.timeout * 1000 || 60 * 1000
            }
        )

        if (response.status !== 200) {
            this.ctx.logger.error(response.data)
            throw new Error(
                JSON.stringify(response.data || response.statusText)
            )
        }

        return response.data
    }

    async editImage(
        config: ImageConfig<'openai'>,
        options: ImageEditOptions,
        session?: Session
    ): Promise<ImageGenerationResponse> {
        const openaiConfig = config.config

        const formData = this.buildEditRequest(options, openaiConfig)

        try {
            const response = await this.ctx.http<ImageGenerationResponse>(
                `${config.url}/images/edits`,
                {
                    data: formData.getBuffer(),
                    method: 'POST',
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${formData.getBoundary()}`,
                        Authorization: `Bearer ${openaiConfig.apiKey}`,
                        ...config.headers
                    },
                    timeout: openaiConfig.timeout * 1000 || 60 * 1000
                }
            )

            if (response.status !== 200) {
                this.ctx.logger.error(response.data)
                throw new Error(
                    JSON.stringify(response.data || response.statusText)
                )
            }

            return response.data
        } catch (error) {
            this.ctx.logger.error(error)
            throw error
        }
    }

    async createVariation(
        config: ImageConfig<'openai'>,
        options: ImageVariationOptions,
        session?: Session
    ): Promise<ImageGenerationResponse> {
        const openaiConfig = config.config as OpenAIConfig

        const formData = this.buildVariationRequest(options, openaiConfig)

        try {
            const response = await this.ctx.http<ImageGenerationResponse>(
                `${config.url}/images/variations`,
                {
                    data: formData.getBuffer(),
                    method: 'POST',
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${formData.getBoundary()}`,
                        Authorization: `Bearer ${openaiConfig.apiKey}`,
                        ...config.headers
                    },
                    timeout: openaiConfig.timeout * 1000 || 60 * 1000
                }
            )

            if (response.status !== 200) {
                this.ctx.logger.error(response.data)
                throw new Error(
                    JSON.stringify(response.data || response.statusText)
                )
            }

            return response.data
        } catch (error) {
            this.ctx.logger.error(error)
            throw error
        }
    }

    private buildGenerationRequest(
        options: ImageGenerationOptions,
        config: OpenAIConfig
    ) {
        const model = options.model || config.defaultModel || 'dall-e-3'

        const requestData: ImageGenerationOptions = {
            model,
            prompt: options.prompt,
            n: model === 'dall-e-3' ? 1 : options.n || 1
        }

        if (options.size) requestData.size = options.size
        if (options.response_format)
            requestData.response_format = options.response_format

        if (model === 'dall-e-3') {
            if (options.quality) requestData.quality = options.quality
            if (options.style) requestData.style = options.style
        }

        if (model === 'gpt-image-1') {
            if (options.background) requestData.background = options.background
            if (options.moderation) requestData.moderation = options.moderation
            if (options.output_compression)
                requestData.output_compression = options.output_compression
            if (options.output_format)
                requestData.output_format = options.output_format
            if (options.quality) requestData.quality = options.quality
        }

        if (options.user) requestData.user = options.user

        return requestData
    }

    private buildEditRequest(options: ImageEditOptions, config: OpenAIConfig) {
        const formData = new FormData()

        const model = options.model || config.defaultModel || 'dall-e-2'
        formData.append('model', model)
        formData.append('prompt', options.prompt)

        if (Buffer.isBuffer(options.image)) {
            formData.append('image', options.image, 'image.png')
        } else if (typeof options.image === 'string') {
            if (options.image.startsWith('http')) {
                throw new Error('图片编辑不支持 URL，请上传文件')
            }
            formData.append(
                'image',
                Buffer.from(options.image, 'base64'),
                'image.png'
            )
        } else if (Array.isArray(options.image)) {
            for (let i = 0; i < options.image.length; i++) {
                formData.append('image', options.image[i], `image_${i}.png`)
            }
        } else {
            throw new Error('图片编辑不支持 URL，请上传文件')
        }

        if (options.mask) {
            if (Buffer.isBuffer(options.mask)) {
                formData.append('mask', options.mask, 'mask.png')
            } else if (typeof options.mask === 'string') {
                formData.append(
                    'mask',
                    Buffer.from(options.mask, 'base64'),
                    'mask.png'
                )
            } else {
                formData.append('mask', options.mask)
            }
        }

        if (options.n) formData.append('n', options.n.toString())
        if (options.size) formData.append('size', options.size)
        if (options.response_format)
            formData.append('response_format', options.response_format)

        if (model === 'gpt-image-1') {
            if (options.background)
                formData.append('background', options.background)
            if (options.output_compression)
                formData.append(
                    'output_compression',
                    options.output_compression.toString()
                )
            if (options.output_format)
                formData.append('output_format', options.output_format)
            if (options.quality) formData.append('quality', options.quality)
        }

        if (options.user) formData.append('user', options.user)

        return formData
    }

    private buildVariationRequest(
        options: ImageVariationOptions,
        config: OpenAIConfig
    ) {
        const formData = new FormData()

        const model = options.model || config.defaultModel || 'dall-e-2'
        formData.append('model', model)

        if (Buffer.isBuffer(options.image)) {
            formData.append('image', options.image, 'image.png')
        } else if (typeof options.image === 'string') {
            if (options.image.startsWith('http')) {
                throw new Error('图片变化不支持 URL，请上传文件')
            }
            formData.append(
                'image',
                Buffer.from(options.image, 'base64'),
                'image.png'
            )
        } else {
            formData.append('image', options.image)
        }

        if (options.n) formData.append('n', options.n.toString())
        if (options.size) formData.append('size', options.size)
        if (options.response_format)
            formData.append('response_format', options.response_format)
        if (options.user) formData.append('user', options.user)

        return formData
    }
}
