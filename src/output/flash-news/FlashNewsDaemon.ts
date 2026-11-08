import Jin10FlushService from './impl/Jin10FlushService';
import XuanGuBaoFlushService from './impl/XuanGuBaoFLushServices';
import ClsFlushService from './impl/ClsFlushService';
import EastmoneyFlushService from './impl/EastmoneyFlushService';
import ThsFlushService from './impl/ThsFlushService';
import WallstreetcnFlushService from './impl/WallstreetcnFlushService';
import NewsFlushServiceAbstractClass, {
  FlashNewsServerInterface,
} from './NewsFlushServiceAbstractClass';



let instance: FlashNewsDaemon | undefined;

export default class FlashNewsDaemon {
  public depServers = new Set<FlashNewsServerInterface>();
  public flushServices = new Set<NewsFlushServiceAbstractClass>();
  public caches: any[][] = [];

  isDestroy = false;

  constructor() {
    this.initServices();
  }

  static KillAllServer() {
    if (instance) {
      instance.depServers.forEach((dep) => {
        dep.destroy();
        instance?.depServers.delete(dep);
      });
      instance.destroy();
    }
  }

  /** 配置变更后重启所有数据源（例如刚填入选股宝 Token） */
  static ReloadAll() {
    if (!instance) {
      return;
    }
    instance.flushServices.forEach((service) => service.destroy());
    instance.flushServices.clear();
    instance.initServices();
  }

  static registerServer(dep: FlashNewsServerInterface) {
    if (!instance) {
      instance = new FlashNewsDaemon();
    }

    instance.depServers.add(dep);
    // 回放缓存时不要改动原数组顺序：caches 是「新 -> 旧」，回放需要「旧 -> 新」
    instance.caches.slice().reverse().forEach((params) => {
      return dep.print.apply(dep, [params[0], params[1]]);
    });

    if (instance.isDestroy) {
      instance.initServices();
    }
    return function cancelServer() {
      instance?.depServers.delete(dep);
      instance?.tryDestroy();
    };
  }

  initServices() {
    // 避免 destroy 后重复 initServices 造成同一数据源被注册多次（多条 WebSocket）
    if (this.flushServices.size > 0) {
      return;
    }
    this.flushServices.add(new Jin10FlushService(this));
    this.flushServices.add(new XuanGuBaoFlushService(this));
    this.flushServices.add(new ClsFlushService(this));
    this.flushServices.add(new EastmoneyFlushService(this));
    this.flushServices.add(new ThsFlushService(this));
    this.flushServices.add(new WallstreetcnFlushService(this));
    this.isDestroy = false;
  }

  print(news: string, source?: { type: string; data: any; time: number }) {
    this.caches.unshift([news, source]);
    // 6 个源首轮各推几十条，缓存太小会把先完成的源挤掉
    this.caches = this.caches.slice(0, 1000);
    this.depServers.forEach((dep) => {
      dep.print(news, source);
    });
  }

  tryDestroy() {
    if (this.depServers.size < 1) {
      this.destroy();
    }
  }

  /**
   * 销毁
   */
  destroy() {
    this.caches.length = 0;
    this.flushServices.forEach((service) => {
      service.destroy();
    });
    this.flushServices.clear();
    this.isDestroy = true;
  }

  reload() {}
}
