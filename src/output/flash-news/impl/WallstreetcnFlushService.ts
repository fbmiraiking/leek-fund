import Axios from 'axios';
import FlashNewsDaemon from '../FlashNewsDaemon';
import { stripHtml } from '../newsModel';
import PollingFlushService, { FlashSourceItem } from '../PollingFlushService';

const WSCN_URL =
  'https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&client=pc&limit=50';

export default class WallstreetcnFlushService extends PollingFlushService {
  protected readonly sourceType = 'wscn';
  protected intervalMs = 30000;

  constructor(readonly daemon: FlashNewsDaemon) {
    super(daemon);
  }

  protected async fetchItems(): Promise<FlashSourceItem[]> {
    const res = await Axios.get(WSCN_URL, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json,text/plain,*/*',
        Referer: 'https://wallstreetcn.com/live',
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const list: any[] = res.data?.data?.items || [];
    return list.map((raw) => {
      const seconds = Number(raw.display_time || raw.created_at || 0);
      const time = seconds ? seconds * 1000 : Date.now();
      const title = stripHtml(String(raw.title || ''));
      const body = stripHtml(
        String(raw.content_text || raw.content || raw.content_more || '')
      );
      return {
        id: `wscn_${raw.id ?? time}`,
        time,
        content: `${title}\r\n${body}\r\n[华尔街见闻]`,
        data: raw,
      };
    });
  }
}
