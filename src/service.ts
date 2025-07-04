import { Context, Service, h, Session } from 'koishi'
import { Config } from './config'
import { ImageAdapter, OpenAIAdapter } from './adapters'
import {
    ImageConfig,
    ImageGenerationOptions,
    ImageEditOptions,
    ImageVariationOptions,
    OpenAIConfigItem,
    ModelFilterOptions
} from './types'
import {
    retryWithConfigs,
    formatRetryErrors,
    validateImageSize,
    validateImageQuality,
    withRetryDelay
} from './utils'

export class DrawLunaService extends Service {
    private _adapters: Record<string, ImageAdapter> = {}
    public _models: Record<string, string[]> = {}
    private _configs: ImageConfig[] = []

    constructor(
        ctx: Context,
        public config: Config
    ) {
        super(ctx, 'drawluna', true)
        this.initializeAdapters()
        this.loadConfigs()
    }

    private initializeAdapters() {
        this.addAdapter(new OpenAIAdapter(this.ctx))
    }

    private loadConfigs() {
        this._configs = []

        if (this.config.openai && this.config.openaiConfigs) {
            for (let i = 0; i < this.config.openaiConfigs.length; i++) {
                const openaiConfig = this.config.openaiConfigs[i]
                this._configs.push(this.convertOpenAIConfig(openaiConfig, i))
            }
        }
    }

    private convertOpenAIConfig(
        openaiConfig: OpenAIConfigItem,
        index: number
    ): ImageConfig<'openai'> {
        return {
            index,
            type: 'openai',
            url: openaiConfig.url,
            headers: openaiConfig.headers,
            config: {
                apiKey: openaiConfig.apiKey,
                defaultModel: openaiConfig.defaultModel,
                defaultSize: openaiConfig.defaultSize,
                defaultQuality: openaiConfig.defaultQuality,
                defaultStyle: openaiConfig.defaultStyle,
                defaultFormat: openaiConfig.defaultFormat,
                timeout: openaiConfig.timeout,
                retryCount: openaiConfig.retryCount
            }
        }
    }

    addAdapter(adapter: ImageAdapter) {
        this._adapters[adapter.type] = adapter
    }

    getAllConfigs(): ImageConfig[] {
        return this._configs.filter((config) => {
            const adapter = this._adapters[config.type]
            return adapter !== undefined
        })
    }

    async getConfigs(options: ModelFilterOptions = {}): Promise<ImageConfig[]> {
        const allConfigs = this.getAllConfigs()
        const { model, fallbackToDefault = true } = options

        if (!model) {
            return allConfigs
        }

        // 首先尝试找到支持指定模型的配置
        const compatibleConfigs = []

        for (const config of allConfigs) {
            const adapter = this._adapters[config.type]
            if (adapter) {
                try {
                    const supportsModel = await adapter.supportsModel(
                        config,
                        model
                    )
                    if (supportsModel) {
                        compatibleConfigs.push(config)
                    }
                } catch (error) {
                    this.ctx.logger.warn(
                        `检查配置 ${config.index} 模型支持时出错: ${error.message}`
                    )
                }
            }
        }

        if (compatibleConfigs.length > 0) {
            return compatibleConfigs
        }

        // 如果没有找到支持指定模型的配置，并且启用了回退
        if (fallbackToDefault) {
            this.ctx.logger.info(
                `未找到支持模型 ${model} 的配置，回退到默认配置`
            )
            return allConfigs
        }

        return []
    }

    async generateImage(
        prompt: string,
        options: Partial<ImageGenerationOptions> = {},
        session?: Session
    ): Promise<h[]> {
        if (prompt.length > this.config.maxPromptLength) {
            throw new Error(
                `提示词过长，请控制在 ${this.config.maxPromptLength} 字符以内`
            )
        }

        const configs = await this.getConfigs({
            model: options.model,
            operation: 'generate',
            fallbackToDefault: true
        })

        if (configs.length === 0) {
            throw new Error('没有可用的配置')
        }

        const result = await retryWithConfigs(
            configs,
            async (config) =>
                withRetryDelay(async () => {
                    const adapter = this._adapters[config.type]
                    if (!adapter) {
                        throw new Error(`适配器 '${config.type}' 不可用`)
                    }

                    // 如果指定的模型不被当前配置支持，使用配置的默认模型
                    let finalOptions = { ...options }
                    if (options.model) {
                        const supportsModel = await adapter.supportsModel(
                            config,
                            options.model
                        )
                        if (!supportsModel) {
                            this.ctx.logger.info(
                                `配置 ${config.index} 不支持模型 ${options.model}，使用默认模型`
                            )
                            finalOptions = {
                                ...options,
                                model: undefined // 让适配器使用默认模型
                            }
                        }
                    }

                    const generateOptions: ImageGenerationOptions = {
                        prompt,
                        ...finalOptions
                    }

                    const response = await adapter.generateImage(
                        config,
                        generateOptions,
                        session
                    )
                    return adapter.createImageElements(response)
                }, config.config.retryCount ?? 2),
            this.ctx.logger.extend('drawluna')
        )

        if (!result.success || !result.result) {
            throw new Error(`图片生成失败: ${formatRetryErrors(result)}`)
        }

        return result.result
    }

    async editImage(
        images: Buffer[],
        prompt: string,
        options: Partial<ImageEditOptions> = {},
        session?: Session
    ): Promise<h[]> {
        if (prompt.length > this.config.maxPromptLength) {
            throw new Error(
                `提示词过长，请控制在 ${this.config.maxPromptLength} 字符以内`
            )
        }

        const configs = await this.getConfigs({
            model: options.model,
            operation: 'edit',
            fallbackToDefault: true
        })

        if (configs.length === 0) {
            throw new Error('没有可用的配置')
        }

        const result = await retryWithConfigs(
            configs,
            async (config) => {
                const adapter = this._adapters[config.type]
                if (!adapter) {
                    throw new Error(`适配器 '${config.type}' 不可用`)
                }

                // 检查模型兼容性
                let finalOptions = { ...options }
                if (options.model) {
                    const supportsModel = await adapter.supportsModel(
                        config,
                        options.model
                    )
                    if (!supportsModel) {
                        this.ctx.logger.info(
                            `配置 ${config.index} 不支持模型 ${options.model}，使用默认模型`
                        )
                        finalOptions = {
                            ...options,
                            model: undefined
                        }
                    }
                }

                const editOptions: ImageEditOptions = {
                    image: images,
                    prompt,
                    ...finalOptions
                }

                const response = await adapter.editImage(
                    config,
                    editOptions,
                    session
                )
                return adapter.createImageElements(response)
            },
            this.ctx.logger.extend('drawluna')
        )

        if (!result.success || !result.result) {
            throw new Error(`图片编辑失败: ${formatRetryErrors(result)}`)
        }

        return result.result
    }

    async createVariation(
        image: string | Buffer | File,
        options: Partial<ImageVariationOptions> = {},
        session?: Session
    ): Promise<h[]> {
        const configs = await this.getConfigs({
            model: options.model,
            operation: 'variation',
            fallbackToDefault: true
        })

        if (configs.length === 0) {
            throw new Error('没有可用的配置')
        }

        const result = await retryWithConfigs(
            configs,
            async (config) => {
                const adapter = this._adapters[config.type]
                if (!adapter) {
                    throw new Error(`适配器 '${config.type}' 不可用`)
                }

                // 检查模型兼容性
                let finalOptions = { ...options }
                if (options.model) {
                    const supportsModel = await adapter.supportsModel(
                        config,
                        options.model
                    )
                    if (!supportsModel) {
                        this.ctx.logger.info(
                            `配置 ${config.index} 不支持模型 ${options.model}，使用默认模型`
                        )
                        finalOptions = {
                            ...options,
                            model: undefined
                        }
                    }
                }

                const variationOptions: ImageVariationOptions = {
                    image,
                    ...finalOptions
                }

                const response = await adapter.createVariation(
                    config,
                    variationOptions,
                    session
                )
                return adapter.createImageElements(response)
            },
            this.ctx.logger.extend('drawluna')
        )

        if (!result.success || !result.result) {
            throw new Error(`图片变化生成失败: ${formatRetryErrors(result)}`)
        }

        return result.result
    }

    async getAvailableModels(): Promise<string[]> {
        const allConfigs = this.getAllConfigs()
        const allModels = new Set<string>()

        for (const config of allConfigs) {
            const adapter = this._adapters[config.type]
            if (adapter) {
                try {
                    const models = await adapter.getModels(config)
                    models.forEach((model) => allModels.add(model))
                } catch (error) {
                    this.ctx.logger.warn(
                        `获取配置 ${config.index} 模型列表失败: ${error.message}`
                    )
                }
            }
        }

        return Array.from(allModels)
    }

    getAvailableConfigs(): string[] {
        return this.getAllConfigs().map((_, index) => `配置${index + 1}`)
    }

    validateImageSize(size: string, model: string): boolean {
        return validateImageSize(size, model)
    }

    validateImageQuality(quality: string, model: string): boolean {
        return validateImageQuality(quality, model)
    }

    isEnabled(): boolean {
        return this.config.openai && this.getAllConfigs().length > 0
    }

    getConfigCount(): number {
        return this.getAllConfigs().length
    }
}

declare module 'koishi' {
    interface Context {
        drawluna: DrawLunaService
    }
}
