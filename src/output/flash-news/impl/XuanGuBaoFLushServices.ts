import FlashNewsDaemon from '../FlashNewsDaemon';
import NewsFlushServiceAbstractClass from '../NewsFlushServiceAbstractClass';
import axios from 'axios';
import { workspace } from 'vscode';
import { formatDateTime } from '../../../shared/utils';

type XuanGuBaoMessage = {
  title: string;
  summary: string;
  impact: number;
  bkj_infos?: any[];
  created_at: number;
  id: number;
};

const NEWS_FLASH_URL = 'https://baoer-api.xuangubao.com.cn/api/v6/message/newsflash';

export default class XuanGuBaoFlushService extends NewsFlushServiceAbstractClass {
  isStop: boolean = false;
  subjectIds: number[] = [9, 10, 723, 35, 469];
  lastestId: number = -1;
  pollingTimer: NodeJS.Timeout | undefined;
  next_cursor: string = '';
  constructor(readonly daemon: FlashNewsDaemon) {
    super(daemon);
    console.log('初始化 选股宝快讯 服务');
    this.polling();
  }
  async polling() {
    if (this.isStop) return;
    let nextDelay = 10000;
    try {
      const token = workspace.getConfiguration('leek-fund').get<string>('xgbToken', '') || '';
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://xuangubao.cn/',
        'X-Appgo-Platform': 'device=pc',
      };
      // 选股宝网页端已改成登录态接口，需要浏览器里的 XGB_PC_PROD_TOKEN
      if (token) {
        headers['X-Ivanka-Token'] = token;
      }
      const res = await axios.get(NEWS_FLASH_URL, {
        headers,
        params: {
          limit: 40,
          subj_ids: this.subjectIds.join(','),
          // has_explain: true,
          platform: 'pcweb',
        },
      });
      const { data } = res;
      if (data.code === 20000) {
        const { messages = [], next_cursor } = data.data;

        if (this.next_cursor === next_cursor) return;
        this.next_cursor = next_cursor;

        if ((messages as XuanGuBaoMessage[]).length) {
          const tempArr: XuanGuBaoMessage[] = [];
          let _lastestId = messages[0].id;
          messages.every((msg: XuanGuBaoMessage) => {
            if (msg.id !== this.lastestId) {
              // this._print(msg);
              tempArr.push(msg);
              return true;
            }
          });

          // 输出需要反转一下时间轴
          tempArr.reverse().forEach((msg) => this._print(msg));

          this.lastestId = _lastestId;
        }
      } else {
        // 没配置 token 时接口会返回「非法的token」，降低轮询频率，避免空转
        nextDelay = 300000;
      }
    } catch (err) {
      console.error(err);
      nextDelay = 5000;
    } finally {
      this.pollingTimer = setTimeout(this.polling.bind(this), nextDelay);
    }
  }
  _print(msg: XuanGuBaoMessage) {
    // let content = `${msg.title}`;
    let impact = '';
    let bkjStr = '';
    if (msg.impact !== 0) {
      impact = msg.impact === 1 ? '【利多 🚀️ 】' : '【利空 🍜️ 】';
    }

    if (msg.bkj_infos?.length) {
      bkjStr = `相关板块：${msg.bkj_infos.map((bkj) => `[${bkj.name}]`).join(' - ')}\r\n`;
    }

    this.print(
      `${msg.title} ${impact} \r\n${msg.summary}\r\n${bkjStr}[选股宝 - ${formatDateTime(
        new Date(msg.created_at * 1000)
      )}]`,
      {
        type: 'xgb',
        data: msg,
        time: msg.created_at * 1000,
      }
    );
  }
  destroy(): void {
    console.log('销毁 选股宝快讯 服务');
    this.pollingTimer && clearTimeout(this.pollingTimer);
    this.isStop = true;
  }
}
