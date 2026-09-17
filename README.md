# V2EX 已忽略节点列表

一个用于查看 V2EX 当前账号已忽略节点的 userscript（用户脚本）。

## 功能

- 在 V2EX「设置 → 忽略设置」页面增加“已忽略节点”面板
- 获取全部 V2EX 节点并逐个检测当前账号的忽略状态
- 显示扫描进度，并支持停止后继续扫描
- 支持清除缓存并重新扫描
- 使用 `localStorage` 保存扫描进度和结果
- 页面再次打开时自动校验缓存中的已忽略节点，及时移除已取消忽略的项目

## 安装

需要先安装用户脚本管理器，例如 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。

### Greasy Fork

[在 Greasy Fork 安装](https://greasyfork.org/zh-CN/scripts/596113-v2ex-%E5%B7%B2%E5%BF%BD%E7%95%A5%E8%8A%82%E7%82%B9%E5%88%97%E8%A1%A8)

### GitHub

[从 GitHub Raw 安装](https://raw.githubusercontent.com/cyzg90/v2ex-ignored-nodes/master/v2ex-ignored-nodes.user.js)

## 使用

1. 登录 V2EX。
2. 打开 <https://www.v2ex.com/settings/block>。
3. 页面顶部会出现“已忽略节点”面板。
4. 首次使用点击“开始扫描”。

扫描结果和进度会保存在当前浏览器的 `localStorage` 中。中途停止后，可以在之后继续扫描。

## 工作原理

V2EX 当前没有直接返回完整“已忽略节点列表”的公开接口。本脚本会：

1. 请求 `/api/nodes/all.json` 获取全部节点。
2. 逐个访问 `/go/<节点名>`。
3. 根据节点页面是否存在“取消忽略节点”入口判断当前账号是否忽略该节点。
4. 将已经检查的节点和已忽略节点保存在本地缓存中。

首次全量扫描会访问较多 V2EX 节点页面。脚本当前使用 2 个低并发 worker，并在每个 worker 的请求之间等待 900 ms，以降低连续请求频率。完整扫描耗时取决于节点总数和网络情况。

## 数据与隐私

脚本只访问 V2EX 同源页面和接口，不向第三方服务发送账号数据。扫描状态保存在浏览器当前 V2EX 站点的 `localStorage` 中。

## 兼容范围

脚本仅匹配：

- `https://v2ex.com/settings/block*`
- `https://www.v2ex.com/settings/block*`

## License

[MIT](./LICENSE)
