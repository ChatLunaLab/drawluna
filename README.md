<div align="center">

# koishi-plugin-drawluna

_多平台 AI 图像生成聚合插件，支持 `OpenAI DALL-E` 等多种图像生成模型_

## [![npm](https://img.shields.io/npm/v/koishi-plugin-drawluna)](https://www.npmjs.com/package/koishi-plugin-drawluna) [![npm](https://img.shields.io/npm/dm/koishi-plugin-drawluna)](https://www.npmjs.com/package/koishi-plugin-drawluna)

![node version](https://img.shields.io/badge/node-%3E=18-green) ![github top language](https://img.shields.io/github/languages/top/ChatLunaLab/drawluna?logo=github)

</div>

## 特性

1. 支持即梦（豆包），OpenAI 的绘图模型
2. 图像编辑（图生图），变体，文生图

## 部署

在 Koishi 插件市场搜索 `drawluna` ，安装后启用即可。

## 使用

### 基础命令

#### 文生图

```
drawluna <提示词> [选项]
```

根据文字描述生成图像

#### 图生图

```
drawluna.edit <提示词> [选项]
```

编辑或扩展现有图片（引用原图或者上传图片）

#### 图像变化

```
drawluna.variation [选项]
```

基于现有图片生成变体（需要先上传图片）

### 命令选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `-m <模型>` | 指定使用的模型 | `-m dall-e-3` |
| `-s <尺寸>` | 设置图片尺寸 | `-s 1024x1024` |
| `-q <质量>` | 设置图片质量 | `-q hd` |
| `-st <风格>` | 设置图片风格 | `-st vivid` |
| `-c <数量>` | 生成图片数量 | `-c 2` |
| `-bg <背景>` | 背景模式 | `-bg transparent` |

## 感谢

感谢 [OpenAI](https://openai.com) 提供优秀的图像生成 API。
感谢 [Koishi](https://koishi.chat) 提供强大的机器人框架。
感谢 [即梦](https://www.volcengine.com/product/jimeng) 提供优秀的图像生成 API。
感谢所有为开源社区做出贡献的开发者们。
