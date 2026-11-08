import Axios from 'axios';
import FlashNewsDaemon from '../FlashNewsDaemon';
import { parseLocalTime, stripHtml } from '../newsModel';
import PollingFlushService, { FlashSourceItem } from '../PollingFlushService';

const EASTMONEY_URL =
  'https://np-listapi.eastmoney.com/comm/web/getFastNewsList' +
  '?client=web&biz=web_news_col&column=350&order=1&needInteractData=0' +
  '&pageIndex=1&pageSize=50&fastColumn=102&sortEnd=&req_trace=1';

export default class EastmoneyFlushService extends PollingFlushService {
  protected readonly sourceType = 'eastmoney';
  protected intervalMs = 30000;

  constructor(readonly daemon: FlashNewsDaemon) {
    super(daemon);
  }

  protected async fetchItems(): Promise<FlashSourceItem[]> {
    const res = await Axios.get(EASTMONEY_URL, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://kuaixun.eastmoney.com/',
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const list: any[] = res.data?.data?.fastNewsList || [];
    return list.map((raw) => {
      const time = parseLocalTime(raw.showTime);
      const title = stripHtml(String(raw.title || ''));
      let body = stripHtml(String(raw.summary || raw.digest || ''));
      if (title && body.startsWith(`【${title}】`)) {
        body = body.slice(title.length + 2).trim();
      } else if (title && body.startsWith(title)) {
        body = body.slice(title.length).trim();
      }
      return {
        id: `em_${raw.code || raw.newsid || time}`,
        time,
        content: `${title}\r\n${body}\r\n[东方财富]`,
        data: raw,
      };
    });
  }
}
