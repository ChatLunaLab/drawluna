import { ImageAdapter } from './base'
import { Context, Session } from 'koishi'
import {
    DoubaoEditOptions,
    DoubaoGenerationOptions,
    DoubaoTaskResultResponse,
    DoubaoTaskSubmitResponse,
    ImageConfig,
    ImageEditOptions,
    ImageGenerationOptions,
    ImageGenerationResponse,
    ImageVariationOptions
} from '../types'
import { createHash, createHmac } from 'crypto'
import { getImageType } from '../utils'

interface DoubaoErrorMapping {
    [key: number]: { message: string; retryable: boolean }
}

export class DoubaoAdapter extends ImageAdapter<'doubao'> {
    type = 'doubao' as const

    private errorMapping: DoubaoErrorMapping = {
        10000: { message: '请求成功', retryable: false },
        50411: {
            message: '输入图片内容审核未通过，请更换图片',
            retryable: false
        },
        50511: {
            message: '输出图片内容审核未通过，建议重新生成',
            retryable: true
        },
        50412: {
            message: '输入文本内容审核未通过，请修改文本内容',
            retryable: false
        },
        50512: { message: '输出文本内容审核未通过', retryable: false },
        50413: {
            message: '输入文本含敏感词或版权词，请修改文本内容',
            retryable: false
        },
        50429: { message: 'QPS超限，请稍后重试', retryable: true },
        50430: { message: '并发超限，请稍后重试', retryable: true },
        50500: { message: '服务内部错误，请稍后重试', retryable: true },
        50501: { message: '算法服务错误，请稍后重试', retryable: true },
        // 添加一些其他可能的错误码
        100006: { message: '请求签名已过期，请检查时间设置', retryable: false },
        100010: { message: '请求签名不匹配，请检查密钥配置', retryable: false }
    }

    constructor(ctx: Context) {
        super(ctx)
    }

    protected async _getModels(
        config: ImageConfig<'doubao'>
    ): Promise<string[]> {
        return this.getDefaultModels()
    }

    protected getDefaultModels(): string[] {
        return ['high_aes_general_v30l_zt2i', 'seededit_v3.0']
    }

    private formatDoubaoError(
        errorCode: number,
        originalMessage?: string
    ): string {
        const errorInfo = this.errorMapping[errorCode]
        if (errorInfo) {
            return `${errorInfo.message} (错误码: ${errorCode})`
        }

        // 处理一些常见的HTTP错误码
        if (errorCode === 401) {
            return 'API密钥验证失败，请检查配置信息'
        }
        if (errorCode === 403) {
            return 'API访问被拒绝，请检查权限设置'
        }
        if (errorCode === 404) {
            return 'API接口不存在，请检查配置'
        }
        if (errorCode === 500) {
            return '服务器内部错误，请稍后重试'
        }

        return `豆包API错误: ${originalMessage || '未知错误'} (错误码: ${errorCode})`
    }

    async generateImage(
        config: ImageConfig<'doubao'>,
        options: ImageGenerationOptions,
        session?: Session
    ): Promise<ImageGenerationResponse> {
        const model =
            options.model ||
            config.config.defaultModel ||
            'high_aes_general_v30l_zt2i'

        if (model === 'seededit_v3.0') {
            throw new Error(
                'seededit_v3.0 模型仅支持图片编辑功能，文生图请使用 high_aes_general_v30l_zt2i 模型'
            )
        }

        const requestData: DoubaoGenerationOptions = {
            req_key: model,
            prompt: options.prompt,
            use_pre_llm: options.use_pre_llm,
            seed: options.seed ?? -1,
            scale: options.scale ?? 2.5,
            width: options.width ?? 1328,
            height: options.height ?? 1328,
            return_url: options.return_url ?? true,
            logo_info: options.logo_info || config.config.logoInfo
        }

        if (model === 'high_aes_general_v30l_zt2i') {
            return this.syncGenerateImage(config, requestData)
        }

        throw new Error(`不支持的模型: ${model}，请使用支持的模型进行文生图`)
    }

    async editImage(
        config: ImageConfig<'doubao'>,
        options: ImageEditOptions,
        session?: Session
    ): Promise<ImageGenerationResponse> {
        const model =
            options.model || config.config.defaultEditModel || 'seededit_v3.0'

        if (!Array.isArray(options.image)) {
            throw new Error('图片编辑功能需要提供图片数据，请上传图片后重试')
        }

        for (const buffer of options.image) {
            const type = getImageType(buffer)
            if (type !== 'image/jpeg' && type !== 'image/png') {
                throw new Error(
                    '豆包图片编辑仅支持 JPEG 和 PNG 格式，请转换图片格式后重试'
                )
            }
        }

        const requestData: DoubaoEditOptions = {
            req_key: model,
            prompt: options.prompt,
            seed: options.seed ?? -1,
            scale: options.scale ?? 0.5,
            binary_data_base64: options.image.map((buffer) =>
                buffer.toString('base64')
            )
        }

        return this.asyncEditImage(config, requestData)
    }

    async createVariation(
        config: ImageConfig<'doubao'>,
        options: ImageVariationOptions,
        session?: Session
    ): Promise<ImageGenerationResponse> {
        throw new Error(
            '豆包暂不支持图片变体功能，建议使用图片编辑功能实现类似效果'
        )
    }

    private async syncGenerateImage(
        config: ImageConfig<'doubao'>,
        requestData: DoubaoGenerationOptions
    ): Promise<ImageGenerationResponse> {
        const url = `${config.url}?Action=CVProcess&Version=2022-08-31`
        const headers = this.buildHeaders(
            config,
            JSON.stringify(requestData),
            url
        )

        const response = await this.ctx.http<{
            code: number
            data: { binary_data_base64: string[]; image_urls: string[] }
            message: string
        }>(url, {
            method: 'POST',
            data: requestData,
            headers,
            timeout: config.config.timeout * 1000 || 60 * 1000
        })

        if (response.status !== 200 || response.data.code !== 10000) {
            this.ctx.logger.error(response.data)
            throw new Error(
                `豆包文生图失败: ${this.formatDoubaoError(response.data.code, response.data.message)}`
            )
        }

        return this.convertToStandardResponse(response.data.data)
    }

    private async asyncEditImage(
        config: ImageConfig<'doubao'>,
        requestData: DoubaoEditOptions
    ): Promise<ImageGenerationResponse> {
        const taskId = await this.submitTask(config, requestData)
        const result = await this.pollTaskResult(
            config,
            taskId,
            requestData.req_key
        )
        return this.convertToStandardResponse(result)
    }

    private async submitTask(
        config: ImageConfig<'doubao'>,
        requestData: DoubaoEditOptions
    ): Promise<string> {
        const url = `${config.url}?Action=CVSync2AsyncSubmitTask&Version=2022-08-31`
        const headers = this.buildHeaders(
            config,
            JSON.stringify(requestData),
            url
        )

        const response = await this.ctx.http<DoubaoTaskSubmitResponse>(url, {
            method: 'POST',
            data: requestData,
            headers,
            timeout: config.config.timeout * 1000 || 60 * 1000
        })

        if (response.status !== 200 || response.data.code !== 10000) {
            this.ctx.logger.error(response.data)
            throw new Error(
                `豆包任务提交失败: ${this.formatDoubaoError(response.data.code, response.data.message)}`
            )
        }

        return response.data.data.task_id
    }

    private async pollTaskResult(
        config: ImageConfig<'doubao'>,
        taskId: string,
        model?: string
    ): Promise<{ binary_data_base64?: string[]; image_urls?: string[] }> {
        for (let attempt = 0; attempt < 30; attempt++) {
            try {
                const result = await this.queryTaskResult(config, taskId, model)

                if (result.data.status === 'done') {
                    return result.data
                } else if (
                    result.data.status === 'not_found' ||
                    result.data.status === 'expired'
                ) {
                    throw new Error(
                        `任务${result.data.status === 'not_found' ? '未找到，请检查任务ID' : '已过期，请重新提交任务'}`
                    )
                }

                await new Promise((resolve) => setTimeout(resolve, 2000))
            } catch (error) {
                this.ctx.logger.error(`查询任务结果失败: ${error.message}`)
                throw new Error(
                    `查询任务结果失败: ${error.message}，请稍后重试`
                )
            }
        }

        throw new Error('任务处理超时，请稍后重试或联系技术支持')
    }

    private async queryTaskResult(
        config: ImageConfig<'doubao'>,
        taskId: string,
        model?: string
    ): Promise<DoubaoTaskResultResponse> {
        const url = `${config.url}?Action=CVSync2AsyncGetResult&Version=2022-08-31`
        const requestData = {
            req_key: model || config.config.defaultEditModel || 'seededit_v3.0',
            task_id: taskId,
            req_json: JSON.stringify({
                return_url: true,
                logo_info: config.config.logoInfo
            })
        }

        const headers = this.buildHeaders(
            config,
            JSON.stringify(requestData),
            url
        )

        const response = await this.ctx.http<DoubaoTaskResultResponse>(url, {
            method: 'POST',
            data: requestData,
            headers,
            timeout: config.config.timeout * 1000 || 60 * 1000
        })

        if (response.status !== 200 || response.data.code !== 10000) {
            this.ctx.logger.error(response.data)
            throw new Error(
                `查询任务结果失败: ${this.formatDoubaoError(response.data.code, response.data.message)}`
            )
        }

        return response.data
    }

    private buildHeaders(
        config: ImageConfig<'doubao'>,
        body: string,
        fullUrl: string
    ): Record<string, string> {
        const {
            accessKey,
            secretKey,
            region = 'cn-north-1',
            service = 'cv'
        } = config.config

        const urlObj = new URL(fullUrl)
        const query: Record<string, string> = {}

        urlObj.searchParams.forEach((value, key) => {
            query[key] = value
        })

        const headers = {
            'X-Date': this.getDateTimeNow(),
            Host: urlObj.host
        }

        const signParams = {
            headers,
            query,
            method: 'POST',
            pathName: '/',
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
            region,
            serviceName: service,
            bodySha: this.hash(body)
        }

        const authorization = this.sign(signParams)

        return {
            'Content-Type': 'application/json',
            ...headers,
            Authorization: authorization
        }
    }

    private sign(params: {
        headers: Record<string, string>
        query: Record<string, string>
        method: string
        pathName: string
        accessKeyId: string
        secretAccessKey: string
        region: string
        serviceName: string
        bodySha: string
    }): string {
        const {
            headers = {},
            query = {},
            method = '',
            pathName = '/',
            accessKeyId = '',
            secretAccessKey = '',
            region = '',
            serviceName = '',
            bodySha
        } = params

        for (const [key, val] of Object.entries(query)) {
            if (val === undefined || val === null) {
                query[key] = ''
            }
        }

        const datetime = headers['X-Date']
        const date = datetime.substring(0, 8)
        const [signedHeaders, canonicalHeaders] = this.getSignHeaders(
            headers,
            []
        )
        const canonicalRequest = [
            method.toUpperCase(),
            pathName,
            this.queryParamsToString(query) || '',
            `${canonicalHeaders}\n`,
            signedHeaders,
            bodySha || this.hash('')
        ].join('\n')

        const credentialScope = [date, region, serviceName, 'request'].join('/')
        const stringToSign = [
            'HMAC-SHA256',
            datetime,
            credentialScope,
            this.hash(canonicalRequest)
        ].join('\n')

        const kDate = this.hmac(secretAccessKey, date)
        const kRegion = this.hmac(kDate, region)
        const kService = this.hmac(kRegion, serviceName)
        const kSigning = this.hmac(kService, 'request')
        const signature = this.hmac(kSigning, stringToSign).toString('hex')

        return [
            'HMAC-SHA256',
            `Credential=${accessKeyId}/${credentialScope},`,
            `SignedHeaders=${signedHeaders},`,
            `Signature=${signature}`
        ].join(' ')
    }

    private getSignHeaders(
        originHeaders: Record<string, string>,
        needSignHeaders: string[]
    ): [string, string] {
        const HEADER_KEYS_TO_IGNORE = new Set([
            'authorization',
            'content-type',
            'content-length',
            'user-agent',
            'presigned-expires',
            'expect'
        ])

        const trimHeaderValue = (header: string): string =>
            header.toString?.().trim().replace(/\s+/g, ' ') ?? ''

        let h = Object.keys(originHeaders)

        if (Array.isArray(needSignHeaders)) {
            const needSignSet = new Set(
                [...needSignHeaders, 'x-date', 'host'].map((k) =>
                    k.toLowerCase()
                )
            )
            h = h.filter((k) => needSignSet.has(k.toLowerCase()))
        }

        h = h.filter((k) => !HEADER_KEYS_TO_IGNORE.has(k.toLowerCase()))

        const signedHeaderKeys = h
            .slice()
            .map((k) => k.toLowerCase())
            .sort()
            .join(';')

        const canonicalHeaders = h
            .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
            .map(
                (k) => `${k.toLowerCase()}:${trimHeaderValue(originHeaders[k])}`
            )
            .join('\n')

        return [signedHeaderKeys, canonicalHeaders]
    }

    private hmac(secret: string | Buffer, s: string): Buffer {
        return createHmac('sha256', secret).update(s, 'utf8').digest()
    }

    private hash(s: string): string {
        return createHash('sha256').update(s, 'utf8').digest('hex')
    }

    private getDateTimeNow(): string {
        const now = new Date()
        return now.toISOString().replace(/[:\-]|\.\d{3}/g, '')
    }

    private queryParamsToString(
        params: Record<string, string | string[]>
    ): string {
        return Object.keys(params)
            .sort()
            .map((key) => {
                const val = params[key]
                if (typeof val === 'undefined' || val === null) {
                    return undefined
                }
                const escapedKey = this.uriEscape(key)
                if (!escapedKey) {
                    return undefined
                }
                if (Array.isArray(val)) {
                    return `${escapedKey}=${val
                        .map((v) => this.uriEscape(v))
                        .sort()
                        .join(`&${escapedKey}=`)}`
                }
                return `${escapedKey}=${this.uriEscape(val)}`
            })
            .filter((v) => v)
            .join('&')
    }

    private uriEscape(str: string): string {
        try {
            return encodeURIComponent(str)
                .replace(/[^A-Za-z0-9_.~\-%]+/g, escape)
                .replace(
                    /[*]/g,
                    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
                )
        } catch (e) {
            return ''
        }
    }

    private convertToStandardResponse(data: {
        binary_data_base64?: string[]
        image_urls?: string[]
    }): ImageGenerationResponse {
        const responseData: ImageGenerationResponse['data'] = []

        if (data.image_urls) {
            data.image_urls.forEach((url) => responseData.push({ url }))
        }

        if (data.binary_data_base64) {
            data.binary_data_base64.forEach((base64) =>
                responseData.push({ b64_json: base64 })
            )
        }

        return {
            created: Math.floor(Date.now() / 1000),
            data: responseData
        }
    }
}

declare module './base' {
    interface ImageAdapterType {
        doubao: never
    }
}
