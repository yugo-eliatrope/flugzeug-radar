import { IntervalHistogram, monitorEventLoopDelay } from 'node:perf_hooks';

import { ILogger } from '../../logger';

export class MonitoringService {
  private histogram: IntervalHistogram = monitorEventLoopDelay({ resolution: 10 });
  private interval: NodeJS.Timeout | null = null;

  constructor(private readonly logger: ILogger) {
    this.histogram.enable();
  }

  public runDiagnostics() {
    this.interval = setInterval(() => {
      const lag = {
        min: (this.histogram.min / 1e6).toFixed(2),
        max: (this.histogram.max / 1e6).toFixed(2),
        avg: (this.histogram.mean / 1e6).toFixed(2),
        p99: (this.histogram.percentile(99) / 1e6).toFixed(2),
      };
      this.logger.info(`EventLoop Lag: avg ${lag.avg}ms, max ${lag.max}ms, p99 ${lag.p99}ms`);
      this.histogram.reset();
    }, 10000);
  }

  public stopDiagnostics() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.histogram.disable();
  }
}
