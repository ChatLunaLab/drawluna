import { Schema } from 'koishi'

export const Config = Schema.intersect([
    Schema.object({
        maxPromptLength: Schema.number()
            .description('最大提示词长度')
            .min(100)
            .max(2000)
            .default(400),
        forwardMessage: Schema.boolean()
            .default(false)
            .description('是否以转发消息的形式发出'),
        showUsage: Schema.boolean()
            .default(true)
            .description('是否显示使用信息'),
        openai: Schema.boolean()
            .default(false)
            .description('是否启用 OpenAI 配置')
    }).description('全局配置'),

    Schema.union([
        Schema.object({
            openai: Schema.const(true).required(),
            openaiConfigs: Schema.array(
                Schema.object({
                    url: Schema.string()
                        .description('API Base URL')
                        .default('https://api.openai.com/v1'),
                    headers: Schema.dict(String)
                        .description('自定义请求头')
                        .default({}),
                    apiKey: Schema.string()
                        .description('API Key')
                        .role('secret')
                        .required(),
                    defaultModel:
                        Schema.dynamic('openai-models').description('默认模型'),
                    defaultSize: Schema.string()
                        .description('默认图片尺寸')
                        .default('1024x1024'),
                    defaultQuality: Schema.string()
                        .description('默认图片质量')
                        .default('standard'),
                    defaultStyle: Schema.string()
                        .description('默认图片风格')
                        .default('vivid'),
                    defaultFormat: Schema.string()
                        .description('默认输出格式')
                        .default('png'),
                    timeout: Schema.number()
                        .description('请求超时时间（秒）')
                        .min(5)
                        .max(120)
                        .default(80),
                    retryCount: Schema.number()
                        .description('请求失败重试次数')
                        .min(0)
                        .max(10)
                        .default(2)
                })
            )
                .description('OpenAI 配置列表')
                .default([])
        }),
        Schema.object({})
    ]).description('OpenAI 配置')
])

export interface Config {
    openai: boolean
    maxPromptLength: number
    forwardMessage: boolean
    showUsage: boolean
    openaiConfigs?: {
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
    }[]
}

export const name = 'drawluna'
