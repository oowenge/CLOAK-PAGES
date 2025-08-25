// Cloudflare Worker — 简易“斗篷系统”模板
// 功能：
// 1) 普通访问 -> 代理到 Pages 静态站（伪装层）
// 2) 指定条件（路径 /go* 或携带密钥）且国家允许 -> 代理到动态源
// 3) /_health 健康检查；KV 可切换维护模式、动态白名单国家
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cf = request.cf || {};
    const country = (cf.country || 'ZZ').toUpperCase();

    // 读取国家白名单：KV 优先，其次 ENV
    let allowedCountries = (env.ALLOWED_COUNTRIES || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    try {
      const kvCountries = await env.CONFIG.get('allowed_countries');
      if (kvCountries) {
        allowedCountries = kvCountries.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      }
    } catch (e) {
      // 无 KV 绑定或读取失败时忽略
    }

    const countryAllowed = allowedCountries.length === 0 || allowedCountries.includes(country);

    const keyFromQuery = url.searchParams.get('k') || '';
    const keyFromHeader = request.headers.get('x-key') || '';
    const unlocked = !!env.ACCESS_KEY && (keyFromQuery === env.ACCESS_KEY || keyFromHeader === env.ACCESS_KEY);

    const pathTrigger = url.pathname.startsWith('/go') || url.pathname.startsWith('/api');
    const shouldDynamic = countryAllowed && (unlocked || pathTrigger);

    // 健康检查
    if (url.pathname === '/_health') {
      const info = {
        ok: true,
        colo: cf.colo || null,
        country,
        dynamicCandidate: shouldDynamic,
        pages: env.PAGES_ORIGIN || null,
        dynamic: env.DYNAMIC_ORIGIN || null
      };
      return json(info);
    }

    // 维护模式（KV: maintenance=1）
    try {
      const maintenance = await env.CONFIG.get('maintenance');
      if (maintenance === '1') {
        return new Response('Service temporarily unavailable', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' }
        });
      }
    } catch (e) {}

    if (shouldDynamic) {
      return proxyTo(env.DYNAMIC_ORIGIN, request, { rewritePrefix: '/go', preservePath: true });
    }
    return proxyTo(env.PAGES_ORIGIN, request, { preservePath: true, cacheStatic: true });
  }
}

async function proxyTo(origin, request, opts = {}) {
  if (!origin) return new Response('Missing origin', { status: 500 });
  const url = new URL(request.url);
  const originUrl = new URL(origin);

  // 路径改写（把 /go 前缀剔除）
  let pathname = url.pathname;
  if (opts.rewritePrefix && pathname.startsWith(opts.rewritePrefix)) {
    pathname = pathname.slice(opts.rewritePrefix.length) || '/';
  }

  const target = new URL(pathname + url.search, originUrl);

  // 复制请求并改写 Host
  const newHeaders = new Headers(request.headers);
  newHeaders.set('host', originUrl.host);

  const reqToOrigin = new Request(target.toString(), {
    method: request.method,
    headers: newHeaders,
    body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
    redirect: 'follow',
  });

  let fetchOpts = {};
  if (opts.cacheStatic && request.method === 'GET') {
    fetchOpts.cf = { cacheEverything: true, cacheTtl: 300 };
  }

  const resp = await fetch(reqToOrigin, fetchOpts);

  // 透传响应并附带标识
  const outHeaders = new Headers(resp.headers);
  outHeaders.set('x-cloak', '1');
  return new Response(resp.body, {
    status: resp.status,
    headers: outHeaders
  });
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}