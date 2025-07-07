import { Context, h, Service, Session } from 'koishi'
import { Config } from './config'
import { DoubaoAdapter, ImageAdapter, OpenAIAdapter } from './adapters'
import {
    ImageConfig,
    ImageEditOptions,
    ImageGenerationOptions,
    ImageVariationOptions,
    ModelFilterOptions,
    OpenAIConfigItem
} from './types'
import {
    formatRetryErrors,
    retryWithConfigs,
    validateImageQuality,
    validateImageSize,
    withRetryDelay
} from './utils'

export class DrawLunaService extends Service {
    private _adapters: Record<string, ImageAdapter<'openai' | 'doubao'>> = {}
    public _models: Record<string, string[]> = {}
    private _configs: (ImageConfig<'openai'> | ImageConfig<'doubao'>)[] = []

    constructor(
        ctx: Context,
        public config: Config
    ) {
        super(ctx, 'drawluna', true)
        this.initializeAdapters()
        this.loadConfigs()
    }

    private initializeAdapters() {
        this.ctx.inject(['drawluna'], (ctx) => {
            if (ctx.config.drawluna.openai) {
                this.addAdapter(new OpenAIAdapter(ctx))
            }
            if (ctx.config.drawluna.doubao) {
                this.addAdapter(new DoubaoAdapter(ctx))
            }
        })
    }

    private loadConfigs() {
        this._configs = []

        if (this.config.openai && this.config.openaiConfigs) {
            for (let i = 0; i < this.config.openaiConfigs.length; i++) {
                this._configs.push(
                    this.convertOpenAIConfig(this.config.openaiConfigs[i], i)
                )
            }
        }

        if (this.config.doubao && this.config.doubaoConfig) {
            this._configs.push(
                this.convertDoubaoConfig(
                    this.config.doubaoConfig,
                    this._configs.length
                )
            )
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
                defaultEditModel: openaiConfig.defaultEditModel,
                defaultSize: openaiConfig.defaultSize,
                defaultQuality: openaiConfig.defaultQuality,
                defaultStyle: openaiConfig.defaultStyle,
                defaultFormat: openaiConfig.defaultFormat,
                timeout: openaiConfig.timeout,
                retryCount: openaiConfig.retryCount
            }
        }
    }

    private convertDoubaoConfig(
        doubaoConfig: NonNullable<Config['doubaoConfig']>,
        index: number
    ): ImageConfig<'doubao'> {
        return {
            index,
            type: 'doubao',
            url: doubaoConfig.url,
            config: {
                apiKey: '',
                accessKey: doubaoConfig.accessKey,
                secretKey: doubaoConfig.secretKey,
                region: doubaoConfig.region,
                service: doubaoConfig.service,
                defaultModel: doubaoConfig.defaultModel,
                defaultEditModel: doubaoConfig.defaultEditModel,
                defaultSize: doubaoConfig.defaultSize,
                timeout: doubaoConfig.timeout,
                retryCount: doubaoConfig.retryCount,
                logoInfo: doubaoConfig.logoInfo
            }
        }
    }

    addAdapter(adapter: ImageAdapter<'openai' | 'doubao'>) {
        this.ctx.logger.success(`register adapter %c`, adapter.type)
        this._adapters[adapter.type] = adapter
    }

    getAllConfigs(): (ImageConfig<'openai'> | ImageConfig<'doubao'>)[] {
        return this._configs.filter(
            (config) => this._adapters[config.type] !== undefined
        )
    }

    async getConfigs(
        options: ModelFilterOptions = {}
    ): Promise<(ImageConfig<'openai'> | ImageConfig<'doubao'>)[]> {
        const allConfigs = this.getAllConfigs()
        const { model, fallbackToDefault = true } = options

        if (!model) return allConfigs

        const compatibleConfigs = []
        for (const config of allConfigs) {
            const adapter = this._adapters[config.type]
            if (adapter) {
                try {
                    if (await adapter.supportsModel(config, model)) {
                        compatibleConfigs.push(config)
                    }
                } catch (error) {
                    this.ctx.logger.warn(
                        `检查配置 ${config.index} 模型支持时出错: ${error.message}`
                    )
                }
            }
        }

        if (compatibleConfigs.length > 0) return compatibleConfigs

        if (fallbackToDefault) {
            this.ctx.logger.info(
                `未找到支持模型 ${model} 的配置，回退到默认配置`
            )
            return allConfigs
        }

        return []
    }

    private validatePrompt(prompt: string) {
        if (prompt.length > this.config.maxPromptLength) {
            throw new Error(
                `提示词过长，请控制在 ${this.config.maxPromptLength} 字符以内`
            )
        }
    }

    private async processWithModel<
        T extends
            | ImageGenerationOptions
            | ImageEditOptions
            | ImageVariationOptions
    >(config: ImageConfig, options: Partial<T>, adapter: ImageAdapter) {
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
                finalOptions = { ...options, model: undefined }
            }
        }
        return finalOptions
    }

    async generateImage(
        prompt: string,
        options: Partial<ImageGenerationOptions> = {},
        session?: Session
    ): Promise<h[]> {
        this.validatePrompt(prompt)

        const configs = await this.getConfigs({
            model: options.model,
            operation: 'generate',
            fallbackToDefault: true
        })

        if (configs.length === 0) throw new Error('没有可用的配置')

        const result = await retryWithConfigs(
            configs,
            async (config) =>
                withRetryDelay(async () => {
                    const adapter = this._adapters[config.type]
                    if (!adapter)
                        throw new Error(`适配器 '${config.type}' 不可用`)

                    const finalOptions =
                        await this.processWithModel<ImageGenerationOptions>(
                            config,
                            options,
                            adapter
                        )
                    const response = await adapter.generateImage(
                        config,
                        { prompt, ...finalOptions },
                        session
                    )
                    return adapter.createImageElements(response)
                }, config.config.retryCount ?? 2),
            this.ctx.logger.extend('')
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
        this.validatePrompt(prompt)

        const configs = await this.getConfigs({
            model: options.model,
            operation: 'edit',
            fallbackToDefault: true
        })

        if (configs.length === 0) throw new Error('没有可用的配置')

        const result = await retryWithConfigs(
            configs,
            async (config) => {
                const adapter = this._adapters[config.type]
                if (!adapter) throw new Error(`适配器 '${config.type}' 不可用`)

                const finalOptions =
                    await this.processWithModel<ImageEditOptions>(
                        config,
                        options,
                        adapter
                    )
                const response = await adapter.editImage(
                    config,
                    { image: images, prompt, ...finalOptions },
                    session
                )
                return adapter.createImageElements(response)
            },
            this.ctx.logger.extend('')
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

        if (configs.length === 0) throw new Error('没有可用的配置')

        const result = await retryWithConfigs(
            configs,
            async (config) => {
                const adapter = this._adapters[config.type]
                if (!adapter) throw new Error(`适配器 '${config.type}' 不可用`)

                const finalOptions =
                    await this.processWithModel<ImageVariationOptions>(
                        config,
                        options,
                        adapter
                    )
                const response = await adapter.createVariation(
                    config,
                    { image, ...finalOptions },
                    session
                )
                return adapter.createImageElements(response)
            },
            this.ctx.logger.extend('')
        )

        if (!result.success || !result.result) {
            throw new Error(`图片变化生成失败: ${formatRetryErrors(result)}`)
        }

        return result.result
    }

    async getAvailableModels(): Promise<string[]> {
        const allModels = new Set<string>()
        for (const config of this.getAllConfigs()) {
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
        return (
            (this.config.openai || this.config.doubao) &&
            this.getAllConfigs().length > 0
        )
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
