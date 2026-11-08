/**
 * 快讯统一模型：把各数据源的原始结构归一化成面板可直接渲染的字段。
 * 这里也是唯一做 HTML 清洗的地方——所有外部内容都必须变成纯文本。
 */

export type NewsSourceId = 'jin10' | 'xgb' | 'cls' | 'eastmoney' | 'ths' | 'wscn';

export const NEWS_SOURCE_NAMES: Record<NewsSourceId, string> = {
  jin10: '金十',
  xgb: '选股宝',
  cls: '财联社',
  eastmoney: '东方财富',
  ths: '同花顺',
  wscn: '华尔街见闻',
};

export interface FlashNewsItem {
  id: string;
  source: NewsSourceId;
  sourceName: string;
  time: number;
  important: boolean;
  kind: 'news' | 'data';
  title: string;
  body: string;
  link: string;
}

const SOURCE_IDS: NewsSourceId[] = ['jin10', 'xgb', 'cls', 'eastmoney', 'ths', 'wscn'];

export function isNewsSourceId(value: any): value is NewsSourceId {
  return SOURCE_IDS.indexOf(value) !== -1;
}

/** 是否含中文；不含则视为外文，需要翻译 */
export function containsChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

export function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 解析 "2026-11-07 23:08:36" 这类本地时间，避免时区偏移 */
export function parseLocalTime(value?: string | number): number {
  if (value === undefined || value === null || value === '') {
    return Date.now();
  }
  if (typeof value === 'number') {
    return value;
  }
  const matched = String(value).match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/
  );
  if (matched) {
    return new Date(
      Number(matched[1]),
      Number(matched[2]) - 1,
      Number(matched[3]),
      Number(matched[4]),
      Number(matched[5]),
      Number(matched[6] || 0)
    ).getTime();
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function splitTitle(text: string): { title: string; body: string } {
  const matched = text.match(/^【([^】]{1,80})】\s*([\s\S]*)$/);
  if (matched) {
    return { title: matched[1], body: matched[2] };
  }
  // 没有【标题】的短讯按项目既有约定：整段作为标题
  return { title: text, body: '' };
}

function makeItem(
  source: NewsSourceId,
  id: string,
  time: number,
  title: string,
  body: string,
  link: string,
  important = false,
  kind: 'news' | 'data' = 'news'
): FlashNewsItem {
  return {
    id,
    source,
    sourceName: NEWS_SOURCE_NAMES[source],
    time,
    important,
    kind,
    title: (title || '').trim(),
    body: (body || '').trim(),
    link: link || '',
  };
}

/**
 * 把 daemon 分发的 { type, data, time } 归一化成统一新闻项。
 */
export function normalizeSource(source?: any): FlashNewsItem | null {
  if (!source || !source.data) {
    return null;
  }
  const type = source.type;
  if (!isNewsSourceId(type)) {
    return null;
  }
  const raw = source.data;
  const time = Number(source.time) || Date.now();

  switch (type) {
    case 'jin10':
      return normalizeJin10(raw, time);
    case 'xgb':
      return normalizeXgb(raw, time);
    case 'cls':
      return normalizeCls(raw, time);
    case 'eastmoney':
      return normalizeEastmoney(raw, time);
    case 'ths':
      return normalizeThs(raw, time);
    case 'wscn':
      return normalizeWscn(raw, time);
    default:
      return null;
  }
}

function normalizeJin10(raw: any, time: number): FlashNewsItem | null {
  const rawId = raw.id || `${time}`;
  const id = `jin10_${rawId}`;
  const data = raw.data || {};
  const link = `https://flash.jin10.com/detail/${rawId}`;

  // type=1 是经济数据（如“美国 10 月 CPI: 3.2%”）
  if (raw.type === 1) {
    const title = [data.country, data.time_period, data.name].filter(Boolean).join(' ');
    return makeItem(
      'jin10',
      id,
      time,
      title || '经济数据',
      `实际值 ${data.actual ?? '-'}${data.unit ?? ''}`,
      link,
      !!raw.important,
      'data'
    );
  }

  const text = stripHtml(String(data.content || data.title || ''));
  if (!text) {
    return null;
  }
  const { title, body } = splitTitle(text);
  return makeItem('jin10', id, time, title, body, link, !!raw.important);
}

function normalizeXgb(raw: any, time: number): FlashNewsItem | null {
  const id = `xgb_${raw.id ?? time}`;
  const title = stripHtml(String(raw.title || ''));
  const summary = stripHtml(String(raw.summary || ''));
  if (!title && !summary) {
    return null;
  }

  let impact = '';
  if (raw.impact === 1) {
    impact = '利多';
  } else if (raw.impact === 2) {
    impact = '利空';
  } else if (raw.impact) {
    impact = '异动';
  }
  const sectors = Array.isArray(raw.bkj_infos)
    ? raw.bkj_infos.map((item: any) => item?.name).filter(Boolean).join('、')
    : '';

  const extras = [
    impact ? `【${impact}】` : '',
    sectors ? `相关板块：${sectors}` : '',
  ].filter(Boolean);
  const body = [title ? summary : '', ...extras].filter(Boolean).join('\n');

  return makeItem(
    'xgb',
    id,
    time,
    title || summary.slice(0, 60),
    body,
    raw.share_url || raw.shareUrl || raw.url || ''
  );
}

function normalizeCls(raw: any, time: number): FlashNewsItem | null {
  const rawId = raw.id ?? time;
  const title = stripHtml(String(raw.title || raw.brief || ''));
  let body = stripHtml(String(raw.content || raw.brief || ''));
  if (title && body.startsWith(title)) {
    body = body.slice(title.length).trim();
  }
  if (!title && !body) {
    return null;
  }
  return makeItem(
    'cls',
    `cls_${rawId}`,
    time,
    title || body.slice(0, 60),
    body,
    raw.shareurl || `https://www.cls.cn/detail/${rawId}`,
    raw.level === 'A'
  );
}

function normalizeEastmoney(raw: any, time: number): FlashNewsItem | null {
  const rawId = raw.code || raw.newsid || time;
  const title = stripHtml(String(raw.title || ''));
  let body = stripHtml(String(raw.summary || raw.digest || ''));
  if (title && body.startsWith(`【${title}】`)) {
    body = body.slice(title.length + 2).trim();
  } else if (title && body.startsWith(title)) {
    body = body.slice(title.length).trim();
  }
  if (!title && !body) {
    return null;
  }
  return makeItem(
    'eastmoney',
    `em_${rawId}`,
    time,
    title || body.slice(0, 60),
    body,
    `https://kuaixun.eastmoney.com/a/${rawId}.html`
  );
}

function normalizeThs(raw: any, time: number): FlashNewsItem | null {
  const rawId = raw.seq || raw.id || time;
  const title = stripHtml(String(raw.title || ''));
  const body = stripHtml(String(raw.digest || raw.short || ''));
  if (!title && !body) {
    return null;
  }
  return makeItem(
    'ths',
    `ths_${rawId}`,
    time,
    title || body.slice(0, 60),
    body,
    raw.url || raw.shareUrl || ''
  );
}

function normalizeWscn(raw: any, time: number): FlashNewsItem | null {
  const rawId = raw.id ?? time;
  const content = raw.content_text || stripHtml(String(raw.content || ''));
  const title = stripHtml(String(raw.title || ''));
  if (!title && !content) {
    return null;
  }
  return makeItem(
    'wscn',
    `wscn_${rawId}`,
    time,
    title || stripHtml(String(content)).slice(0, 60),
    stripHtml(String(content)),
    raw.uri || `https://wallstreetcn.com/livenews/${rawId}`,
    Number(raw.score) >= 3
  );
}
