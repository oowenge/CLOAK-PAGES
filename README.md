# Cloudflare “斗篷系统”入门模板（Workers + Pages + KV + GeoIP）

> 用于合法的流量分流、A/B 测试、区域化内容和隐藏源站。请勿用于任何违法或绕过平台/国家监管的用途；遵守 Cloudflare 服务条款与当地法律。

## 一、准备
- Cloudflare 账号 &（可选）已接入的自有域名
- Node.js 18+
- Wrangler CLI：无需全局安装，直接用 `npx wrangler@latest` 即可

## 二、快速开始（10 分钟）
1) **发布静态伪装层（Pages）**
```bash
# 进入模板目录
cd cf-cloak-starter

# 发布 pages/ 目录为 Cloudflare Pages 项目（首次会让你登录并创建项目名）
npx wrangler@latest pages publish ./pages --project-name CLOAK-PAGES
```
命令完成后会输出一个形如 `https://CLOAK-PAGES.pages.dev` 的 URL。把它填到 `wrangler.toml` 中的：
```toml
PAGES_ORIGIN = "https://CLOAK-PAGES.pages.dev"
```

2) **创建 KV 并绑定**
```bash
# 创建命名空间（返回的 id/preview_id 要写回 wrangler.toml）
npx wrangler@latest kv:namespace create CONFIG
```
把返回的 `id`/`preview_id` 写入 `wrangler.toml` 对应位置。随后可选设置：
```bash
# 开维护模式
npx wrangler@latest kv:key put --binding=CONFIG maintenance 1
# 关维护模式
npx wrangler@latest kv:key put --binding=CONFIG maintenance 0
# 动态白名单国家（覆盖 ENV 中 ALLOWED_COUNTRIES）
npx wrangler@latest kv:key put --binding=CONFIG allowed_countries "BR,PT,US"
```

3) **设置密钥与变量**
```bash
# 解锁动态层用的密钥（用于 ?k= 或 X-Key 头），自行设置复杂值
npx wrangler@latest secret put ACCESS_KEY

# 若需修改 ENV 变量，直接编辑 wrangler.toml：
# - PAGES_ORIGIN：你的 Pages 地址
# - DYNAMIC_ORIGIN：你的真实后端/源站，例如 https://api.example.com
# - ALLOWED_COUNTRIES：允许触发动态层的国家（ISO 两位码）
```

4) **部署 Worker**
```bash
npx wrangler@latest deploy
```
部署成功后会得到 `https://cf-cloak.<你的子域>.workers.dev`。有自有域名的用户可在 `wrangler.toml` 中配置 `routes`，或在 Cloudflare 仪表盘把 Worker 绑定到域名路径。

## 三、工作机制
- 访问 `/_health`：返回 JSON（国家、机房、当前目标等）。
- 访问普通路径（不是 `/go*` 也未携带密钥） → 代理到 `PAGES_ORIGIN` 静态站。
- 访问 `/go/*` 或携带 `?k=密钥`/`X-Key: 密钥` 且国家在白名单 → 代理到 `DYNAMIC_ORIGIN`。  
- GET 到静态页默认带有边缘缓存（`cacheTtl=300`）。

## 四、常见改法
- 修改触发条件：在 `index.js` 里改 `pathTrigger` 或 `unlocked` 逻辑。
- 精细 GeoIP：把 `allowed_countries` 做成更复杂的 KV JSON，比如按路径/UA 定义。
- 灰度发布：KV 里加 `rollout=0.1`，对 10% 访客走动态，其余走静态。
- 本地预览：`npx wrangler dev`（注意 Workers 的 GeoIP 在本地可能不可用）。

## 五、排错
- `522/525` 到动态源：检查 `DYNAMIC_ORIGIN` 是否可被 Cloudflare 访问（TLS/防火墙/证书）。
- `1016/1033` 资源找不到：确认 `PAGES_ORIGIN` 是否正确、Pages 项目已发布成功。
- `KV 读写失败`：确认已在 `wrangler.toml` 里填入 `kv_namespaces` 的 id/preview_id。

## 六、合规提醒
- 不要把本模板用于欺诈、恶意软件投递、规避封禁侦测等用途。
- Cloudflare 免费额度（如 Workers 每日调用数、KV 读写等）可能会调整，请以官方为准。

祝构建顺利 🚀