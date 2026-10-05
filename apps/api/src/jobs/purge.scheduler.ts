import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ExpiredRowsRepository } from "@tdm/postgres-adapter";
import { EXPIRED_ROWS_REPOSITORY } from "../infrastructure/tokens";

/** Daily removal of expired credentials and spent de-duplication markers from the platform store. */
@Injectable()
export class PurgeScheduler {
  private readonly logger = new Logger(PurgeScheduler.name);

  constructor(@Inject(EXPIRED_ROWS_REPOSITORY) private readonly expiredRows: ExpiredRowsRepository) {}

  @Cron("30 3 * * *")
  async purgeExpiredRows(): Promise<void> {
    try {
      const removed = await this.expiredRows.purge();
      this.logger.log(JSON.stringify({ event: "expired_rows_purged", removed }));
    } catch (err) {
      this.logger.error(JSON.stringify({ event: "expired_rows_purge_failed", reason: (err as Error).message }));
    }
  }
}
