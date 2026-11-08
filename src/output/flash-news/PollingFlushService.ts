import FlashNewsDaemon from './FlashNewsDaemon';
import NewsFlushServiceAbstractClass from './NewsFlushServiceAbstractClass';

export interface FlashSourceItem {
  id: string;
  time: number;
  /** 给 OUTPUT 面板/其他订阅者看的纯文本 */
  content: string;
  data: any;
}

/**
 * 通用轮询数据源基类。
 * 子类只需要实现 fetchItems()，去重、排序、首屏回补、销毁都由这里处理。
 */
export default abstract class PollingFlushService extends NewsFlushServiceAbstractClass {
  protected abstract readonly sourceType: string;
  protected intervalMs = 30000;
  protected firstLoadLimit = 40;
  protected maxPerRound = 100;
  protected seenLimit = 2000;

  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;
  private firstLoad = true;
  private seen = new Set<string>();

  constructor(readonly daemon: FlashNewsDaemon) {
    super(daemon);
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  protected abstract fetchItems(): Promise<FlashSourceItem[]>;

  async tick() {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    try {
      const items = await this.fetchItems();
      this.handle(items);
    } catch (err: any) {
      console.error(`[${this.sourceType}] 快讯轮询失败：`, err?.message || err);
    } finally {
      this.running = false;
    }
  }

  private handle(items: FlashSourceItem[]) {
    if (!items || !items.length) {
      return;
    }
    const fresh = items
      .filter((item) => item && item.id && !this.seen.has(item.id))
      .sort((a, b) => a.time - b.time);

    const limit = this.firstLoad ? this.firstLoadLimit : this.maxPerRound;
    const selected = fresh.slice(-limit);
    this.firstLoad = false;

    selected.forEach((item) => {
      this.markSeen(item.id);
      this.print(item.content, {
        type: this.sourceType,
        data: item.data,
        time: item.time,
      });
    });
  }

  private markSeen(id: string) {
    this.seen.add(id);
    if (this.seen.size > this.seenLimit) {
      const iterator = this.seen.values();
      for (let i = 0; i < this.seenLimit / 2; i++) {
        const next = iterator.next();
        if (next.done) {
          break;
        }
        this.seen.delete(next.value);
      }
    }
  }

  destroy() {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  pause() {}
}
