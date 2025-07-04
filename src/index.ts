import { Context, h } from 'koishi'
import { Config } from './config'
import { DrawLunaService } from './service'
import {
    ImageEditOptions,
    ImageGenerationOptions,
    ImageVariationOptions
} from './types'
import { handleImageUpload } from './utils'

export function apply(ctx: Context, config: Config) {
    ctx.plugin(DrawLunaService, config)

    ctx.inject(['drawluna'], (ctx) => {
        const drawluna = ctx.drawluna as DrawLunaService

        ctx.command('drawluna <prompt:text>', '文生图：根据提示词生成图片')
            .option(
                'model',
                '-m <model:string> 使用指定模型 (dall-e-2, dall-e-3, gpt-image-1)'
            )
            .option('size', '-s <size:string> 图片尺寸')
            .option('quality', '-q <quality:string> 图片质量')
            .option('style', '-st <style:string> 图片风格 (vivid, natural)')
            .option('count', '-c <count:number> 生成数量', { fallback: 1 })
            .option('format', '-f <format:string> 输出格式 (png, jpeg, webp)')
            .option(
                'background',
                '-bg <background:string> 背景透明度 (transparent, opaque, auto)'
            )
            .action(async ({ session, options }, prompt) => {
                if (!prompt) {
                    await session.execute('draw -h')
                    return
                }

                let messageId: string | undefined

                try {
                    messageId = await session
                        .send('正在生成图片，请稍候...')
                        .then((messageIds) => messageIds[0])

                    const generateOptions: Partial<ImageGenerationOptions> = {}
                    if (options.model) generateOptions.model = options.model
                    if (options.size) generateOptions.size = options.size
                    if (options.quality)
                        generateOptions.quality = options.quality
                    if (options.style) generateOptions.style = options.style
                    if (options.count) generateOptions.n = options.count
                    if (options.format)
                        generateOptions.output_format = options.format as
                            | 'png'
                            | 'jpeg'
                            | 'webp'
                    if (options.background)
                        generateOptions.background = options.background as
                            | 'transparent'
                            | 'opaque'
                            | 'auto'

                    const images = await drawluna.generateImage(
                        prompt,
                        generateOptions,
                        session
                    )

                    if (images.length === 0) {
                        return '图片生成失败，请稍后重试。'
                    }

                    return h(
                        'message',
                        config.forwardMessage ? { forward: true } : {},
                        ...images
                    )
                } catch (error) {
                    return `图片生成失败：${error.message}`
                } finally {
                    if (messageId) {
                        await session.bot.deleteMessage(
                            session.channelId,
                            messageId
                        )
                    }
                }
            })

        ctx.command('drawluna.edit <prompt:text>', '图生图：编辑或扩展现有图片')
            .option(
                'model',
                '-m <model:string> 使用指定模型 (dall-e-2, gpt-image-1)'
            )
            .option('size', '-s <size:string> 图片尺寸')
            .option('quality', '-q <quality:string> 图片质量')
            .option('count', '-c <count:number> 生成数量', { fallback: 1 })
            .option('format', '-f <format:string> 输出格式 (png, jpeg, webp)')
            .option(
                'background',
                '-bg <background:string> 背景透明度 (transparent, opaque, auto)'
            )
            .action(async ({ session, options }, prompt) => {
                if (!prompt) {
                    await session.execute('draw.edit -h')
                    return
                }

                let messageId: string | undefined

                return await handleImageUpload(
                    session,
                    prompt,
                    async (imageData) => {
                        try {
                            messageId = await session
                                .send('正在编辑图片，请稍候...')
                                .then((messageIds) => messageIds[0])

                            const editOptions: Partial<ImageEditOptions> = {}
                            if (options.model) editOptions.model = options.model
                            if (options.size) editOptions.size = options.size
                            if (options.quality)
                                editOptions.quality = options.quality
                            if (options.count) editOptions.n = options.count
                            if (options.format)
                                editOptions.output_format = options.format as
                                    | 'png'
                                    | 'jpeg'
                                    | 'webp'
                            if (options.background)
                                editOptions.background = options.background as
                                    | 'transparent'
                                    | 'opaque'
                                    | 'auto'

                            const textPrompt = h
                                .select(h.parse(prompt), 'text')
                                .map((text) => text.toString())
                                .join('\n')

                            const images = await drawluna.editImage(
                                imageData,
                                textPrompt,
                                editOptions,
                                session
                            )

                            if (images.length === 0) {
                                return '图片编辑失败，请稍后重试。'
                            }

                            return h(
                                'message',
                                config.forwardMessage ? { forward: true } : {},
                                ...images
                            )
                        } catch (error) {
                            return `图片编辑失败：${error.message}`
                        } finally {
                            if (messageId) {
                                await session.bot.deleteMessage(
                                    session.channelId,
                                    messageId
                                )
                            }
                        }
                    }
                )
            })

        ctx.command(
            'drawluna.variation <prompt:text>',
            '图像变化：生成现有图片的变体'
        )
            .option('model', '-m <model:string> 使用指定模型 (dall-e-2)')
            .option('size', '-s <size:string> 图片尺寸')
            .option('count', '-c <count:number> 生成数量', { fallback: 1 })
            .action(async ({ session, options }, prompt) => {
                let messageId: string | undefined

                return await handleImageUpload(
                    session,
                    prompt,
                    async (imageData) => {
                        try {
                            messageId = await session
                                .send('正在生成图片变体，请稍候...')
                                .then((messageIds) => messageIds[0])

                            if (imageData.length === 0) {
                                return '没有可用的图片'
                            }

                            if (imageData.length > 1) {
                                return '不支持批量图片变体生成'
                            }

                            await session.send('正在生成图片变体，请稍候...')

                            const variationOptions: Partial<ImageVariationOptions> =
                                {}
                            if (options.model)
                                variationOptions.model = options.model
                            if (options.size)
                                variationOptions.size = options.size
                            if (options.count)
                                variationOptions.n = options.count

                            const images = await drawluna.createVariation(
                                imageData[0],
                                variationOptions,
                                session
                            )

                            if (images.length === 0) {
                                return '图片变体生成失败，请稍后重试。'
                            }

                            return h(
                                'message',
                                config.forwardMessage ? { forward: true } : {},
                                ...images
                            )
                        } catch (error) {
                            return `图片变体生成失败：${error.message}`
                        } finally {
                            if (messageId) {
                                await session.bot.deleteMessage(
                                    session.channelId,
                                    messageId
                                )
                            }
                        }
                    }
                )
            })
    })
}

export * from './config'
export * from './types'
