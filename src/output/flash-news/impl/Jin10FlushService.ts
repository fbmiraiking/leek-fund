import Axios from 'axios';
import FlashNewsDaemon from '../FlashNewsDaemon';
import NewsFlushServiceAbstractClass from '../NewsFlushServiceAbstractClass';

/**
 * 金十快讯数据源。
 *
 * 说明：金十的 WebSocket（wss://wss-flash-2.jin10.com/）已经改为加密帧，
 * 旧的「前 2 字节类型 + 后 2 字节长度 + JSON」协议不再成立。
 * 这里改用其网页公开的快照接口 `flash_newest.js` 轮询，
 * 单次约 30KB，10~15 秒一次对服务端压力很小。
 */
const FLASH_URL = 'https://www.jin10.com/flash_newest.js';
const POLL_INTERVAL = 20000;
const FIRST_LOAD_LIMIT = 60;
const SEEN_LIMIT = 2000;

export default class Jin10FlushService extends NewsFlushServiceAbstractClass {
  private timer: NodeJS.Timeout | undefined;
  private destroyed = false;
  private polling = false;
  private firstLoad = true;
  private seen = new Set<string>();
  private etag: string | undefined;

  constructor(readonly daemon: FlashNewsDaemon) {
    super(daemon);
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL);
  }

  async poll() {
    if (this.polling || this.destroyed) {
      return;
    }
    this.polling = true;
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.jin10.com/',
      };
      if (this.etag) {
        headers['If-None-Match'] = this.etag;
      }
      const res = await Axios.get(`${FLASH_URL}?t=${Date.now()}`, {
        timeout: 15000,
        responseType: 'text',
        headers,
        // 304 表示内容没变：省下 30KB 流量
        validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
        transformResponse: [(data) => data],
      });
      if (res.status === 304) {
        return;
      }
      this.etag = res.headers?.etag || res.headers?.ETag || this.etag;
      const list = this.parse(typeof res.data === 'string' ? res.data : String(res.data ?? ''));
      this.handle(list);
    } catch (err: any) {
      console.error('金十快讯轮询失败：', err?.message || err);
    } finally {
      this.polling = false;
    }
  }

  private parse(text: string): any[] {
    const json = text
      .replace(/^var\s+newest\s*=\s*/, '')
      .replace(/;+\s*$/, '')
      .trim();
    if (!json) {
      return [];
    }
    try {
      const list = JSON.parse(json);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      console.error('金十快讯解析失败：', err);
      return [];
    }
  }

  private handle(list: any[]) {
    if (!list.length) {
      return;
    }

    const fresh = list
      .filter((item) => item && item.id && !this.seen.has(String(item.id)))
      .filter((item) => !this.isAD(String(item?.data?.content || '')))
      // 接口返回是「新 -> 旧」，先转成「旧 -> 新」再逐条推送
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // 首次只展示最新 60 条；之后每次最多补 100 条，避免长时间离线后一次性刷屏
    const limit = this.firstLoad ? FIRST_LOAD_LIMIT : 100;
    const selected = fresh.slice(-limit);
    this.firstLoad = false;

    selected.forEach((item) => {
      this.markSeen(String(item.id));
      const time = new Date(item.time).getTime();
      const content = this.formatContent(String(item?.data?.content || item?.data?.title || ''));
      if (!content) {
        return;
      }
      this.print(content, {
        type: 'jin10',
        data: item,
        time,
      });
    });
  }

  private markSeen(id: string) {
    this.seen.add(id);
    if (this.seen.size > SEEN_LIMIT) {
      // Set 保持插入顺序，淘汰最早的一批
      const iterator = this.seen.values();
      for (let i = 0; i < SEEN_LIMIT / 2; i++) {
        const next = iterator.next();
        if (next.done) {
          break;
        }
        this.seen.delete(next.value);
      }
    }
  }

  /**
   * 是否广告（纯图片链接）
   */
  private isAD(content: string) {
    return /^<a.*?>\s*<img.*?\/?>\s*<\/a>$/.test(content);
  }

  private formatContent(content: string) {
    let result = content.replace(/<br\s*\/?>/gi, '\r\n　　').replace(/(<([^>]+)>)/gi, '');
    if (result[0] === '【') {
      result = result.replace('】', '】\r\n　　');
    } else {
      result = '　　' + result;
    }
    return result.trim();
  }

  destroy() {
    console.log('销毁 金十 快讯服务');
    this.destroyed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  pause() {}
}
