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
            .description('是否启用 OpenAI 配置'),
        doubao: Schema.boolean().default(false).description('是否启用豆包配置')
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
                    defaultEditModel:
                        Schema.dynamic('openai-models').description(
                            '默认的图像编辑模型'
                        ),
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
        Schema.object({
            doubao: Schema.const(true).required(),
            doubaoConfig: Schema.object({
                url: Schema.string()
                    .description('API Base URL')
                    .default('https://visual.volcengineapi.com'),
                accessKey: Schema.string()
                    .description('访问密钥')
                    .role('secret')
                    .required(),
                secretKey: Schema.string()
                    .description('安全密钥')
                    .role('secret')
                    .required(),
                region: Schema.string()
                    .description('区域')
                    .default('cn-north-1'),
                service: Schema.string().description('服务名称').default('cv'),
                defaultModel: Schema.union([
                    Schema.const('high_aes_general_v30l_zt2i'),
                    Schema.const('seededit_v3.0')
                ])
                    .description('默认模型')
                    .default('high_aes_general_v30l_zt2i'),
                defaultEditModel: Schema.union([
                    Schema.const('high_aes_general_v30l_zt2i'),
                    Schema.const('seededit_v3.0')
                ])
                    .description('默认的图像编辑模型')
                    .default('seededit_v3.0'),
                defaultSize: Schema.string()
                    .description('默认图片尺寸')
                    .default('1328x1328'),
                timeout: Schema.number()
                    .description('请求超时时间（秒）')
                    .min(5)
                    .max(120)
                    .default(80),
                retryCount: Schema.number()
                    .description('请求失败重试次数')
                    .min(0)
                    .max(10)
                    .default(2),
                logoInfo: Schema.object({
                    add_logo: Schema.boolean()
                        .description('是否添加水印')
                        .default(false),
                    position: Schema.union([
                        Schema.const(0),
                        Schema.const(1),
                        Schema.const(2),
                        Schema.const(3)
                    ])
                        .description(
                            '水印位置 (0-右下角 1-左下角 2-左上角 3-右上角)'
                        )
                        .default(0),
                    language: Schema.union([Schema.const(0), Schema.const(1)])
                        .description('水印语言 (0-中文 1-英文)')
                        .default(0),
                    opacity: Schema.number()
                        .description('水印不透明度 (0-1)')
                        .min(0)
                        .max(1)
                        .default(0.3),
                    logo_text_content: Schema.string()
                        .description('自定义水印内容')
                        .default('')
                }).description('水印配置')
            }).description('豆包配置')
        }),
        Schema.object({})
    ]).description('服务提供商配置')
])

export interface Config {
    openai: boolean
    doubao: boolean
    maxPromptLength: number
    forwardMessage: boolean
    showUsage: boolean
    openaiConfigs?: {
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
    }[]
    doubaoConfig?: {
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
        logoInfo: {
            add_logo: boolean
            position: 0 | 1 | 2 | 3
            language: 0 | 1
            opacity: number
            logo_text_content: string
        }
    }
}

export const name = 'drawluna'
