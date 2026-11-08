import Axios from 'axios';
import { createHash } from 'crypto';
import FlashNewsDaemon from '../FlashNewsDaemon';
import { stripHtml } from '../newsModel';
import PollingFlushService, { FlashSourceItem } from '../PollingFlushService';

const CLS_URL = 'https://www.cls.cn/v1/roll/get_roll_list';

function serializeValue(value: any, key: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${key}=${value}`;
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return `${key}[]`;
    }
    return value
      .map((item, index) => serializeValue(item, `${key}[${index}]`))
      .filter(Boolean)
      .join('&');
  }
  if (typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => a.toUpperCase().localeCompare(b.toUpperCase()))
      .map((itemKey) => serializeValue(value[itemKey], `${key}[${itemKey}]`))
      .filter(Boolean)
      .join('&');
  }
  return null;
}

/** 财联社网页端签名：md5(sha1(按 key 大写排序后的参数串)) */
function clsSign(params: Record<string, any>): string {
  const serialized = Object.keys(params)
    .sort((a, b) => a.toUpperCase().localeCompare(b.toUpperCase()))
    .map((key) => serializeValue(params[key], key))
    .filter(Boolean)
    .join('&');
  const sha1 = createHash('sha1').update(serialized).digest('hex');
  return createHash('md5').update(sha1).digest('hex');
}

export default class ClsFlushService extends PollingFlushService {
  protected readonly sourceType = 'cls';
  protected intervalMs = 30000;

  constructor(readonly daemon: FlashNewsDaemon) {
    super(daemon);
  }

  protected async fetchItems(): Promise<FlashSourceItem[]> {
    const params: Record<string, any> = {
      refresh_type: 1,
      rn: 50,
      last_time: 0,
      os: 'web',
      sv: '8.7.9',
      app: 'CailianpressWeb',
    };
    params.sign = clsSign(params);

    const query = new URLSearchParams(
      Object.keys(params).map((key) => [key, String(params[key])])
    ).toString();

    const res = await Axios.get(`${CLS_URL}?${query}`, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.cls.cn/telegraph',
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const list: any[] = res.data?.data?.roll_data || [];
    return list.map((raw) => {
      const time = Number(raw.ctime) * 1000 || Date.now();
      const title = stripHtml(String(raw.title || raw.brief || ''));
      let body = stripHtml(String(raw.content || raw.brief || ''));
      if (title && body.startsWith(title)) {
        body = body.slice(title.length).trim();
      }
      return {
        id: `cls_${raw.id ?? time}`,
        time,
        content: `${title}\r\n${body}\r\n[财联社]`,
        data: raw,
      };
    });
  }
}
