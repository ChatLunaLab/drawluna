import { Context, h, Schema, Session } from 'koishi'
import {
    ImageConfig,
    ImageEditOptions,
    ImageGenerationOptions,
    ImageGenerationResponse,
    ImageVariationOptions
} from '../types'

export abstract class ImageAdapter<
    T extends keyof ImageAdapterType = keyof ImageAdapterType
> {
    abstract type: T
    private modelCache: Map<string, { models: string[]; timestamp: number }> =
        new Map()

    private readonly CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

    constructor(public ctx: Context) {}

    abstract generateImage(
        config: ImageConfig<T>,
        options: ImageGenerationOptions,
        session?: Session
    ): Promise<ImageGenerationResponse>

    abstract editImage(
        config: ImageConfig<T>,
        options: ImageEditOptions,
        session?: Session
    ): Promise<ImageGenerationResponse>

    abstract createVariation(
        config: ImageConfig<T>,
        options: ImageVariationOptions,
        session?: Session
    ): Promise<ImageGenerationResponse>

    protected abstract _getModels(config: ImageConfig<T>): Promise<string[]>

    async getModels(config: ImageConfig<T>): Promise<string[]> {
        const cacheKey = `${config.type}_${config.index}`
        const cached = this.modelCache.get(cacheKey)

        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            return cached.models
        }

        try {
            let models = await this._getModels(config)

            const existingModels = this.ctx.drawluna._models[config.type]
            if (existingModels) {
                models = Array.from(
                    new Set([...existingModels, ...models])
                ).sort()
                this.ctx.drawluna._models[config.type] = models
            }

            if (models.length > 0) {
                this.ctx.schema.set(
                    `${config.type}-models`,
                    Schema.union(models.map((model) => Schema.const(model)))
                )
            }
            this.modelCache.set(cacheKey, {
                models,
                timestamp: Date.now()
            })
            return models
        } catch (error) {
            this.ctx.logger.error(error)
            this.ctx.logger.warn(`获取模型列表失败: ${error.message}`)
            // 返回缓存的模型（如果有）
            if (cached) {
                return cached.models
            }
            // 返回默认模型
            return this.getDefaultModels()
        }
    }

    protected abstract getDefaultModels(): string[]

    async supportsModel(
        config: ImageConfig<T>,
        model: string
    ): Promise<boolean> {
        const models = await this.getModels(config)
        return models.includes(model)
    }

    clearModelCache(config?: ImageConfig<T>): void {
        if (config) {
            const cacheKey = `${config.type}_${config.index}`
            this.modelCache.delete(cacheKey)
        } else {
            this.modelCache.clear()
        }
    }

    async createImageElements(response: ImageGenerationResponse): Promise<h[]> {
        const elements: h[] = []

        for (const item of response.data) {
            if (item.url) {
                elements.push(h.image(item.url))
            } else if (item.b64_json) {
                const base64 = item.b64_json.startsWith('data:image')
                    ? item.b64_json.split(',')[1]
                    : `data:image/png;base64,${item.b64_json}`
                elements.push(h.image(base64))
            }
        }

        if (response.usage && this.ctx.drawluna.config.showUsage) {
            elements.push(
                h.text('\n\n\n'),
                h.text(`输入 token: ${response.usage.input_tokens}\n`),
                h.text(`输出 token: ${response.usage.output_tokens}`)
            )
        }

        return elements
    }
}

export interface ImageAdapterType {}
