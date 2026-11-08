import Axios from 'axios';
import FlashNewsDaemon from '../FlashNewsDaemon';
import { stripHtml } from '../newsModel';
import PollingFlushService, { FlashSourceItem } from '../PollingFlushService';

const THS_URL =
  'https://news.10jqka.com.cn/tapp/news/push/stock/?page=1&tag=&track=website&pagesize=50';

export default class ThsFlushService extends PollingFlushService {
  protected readonly sourceType = 'ths';
  protected intervalMs = 30000;

  constructor(readonly daemon: FlashNewsDaemon) {
    super(daemon);
  }

  protected async fetchItems(): Promise<FlashSourceItem[]> {
    const res = await Axios.get(THS_URL, {
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Referer: 'https://news.10jqka.com.cn/',
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const list: any[] = res.data?.data?.list || [];
    return list.map((raw) => {
      const seconds = Number(raw.ctime || raw.rtime || 0);
      const time = seconds ? seconds * 1000 : Date.now();
      const title = stripHtml(String(raw.title || ''));
      const body = stripHtml(String(raw.digest || raw.short || ''));
      return {
        id: `ths_${raw.seq || raw.id || time}`,
        time,
        content: `${title}\r\n${body}\r\n[同花顺]`,
        data: raw,
      };
    });
  }
}
