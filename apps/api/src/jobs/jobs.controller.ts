import { Controller, HttpCode, Logger, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ReminderScheduler } from "../bookings/reminder.scheduler";
import { FollowUpScheduler } from "../bookings/followup.scheduler";
import { JobTriggerGuard } from "./job-trigger.guard";
import { PurgeScheduler } from "./purge.scheduler";

/**
 * HTTP triggers for the background jobs when SCHEDULER_MODE=external (serverless hosting). Each job
 * is idempotent per booking/interval (reminder and follow-up logs), so a retried trigger is safe;
 * the external scheduler must still not overlap runs of the same job.
 */
@SkipThrottle()
@UseGuards(JobTriggerGuard)
@Controller("internal/jobs")
export class JobsController {
  private readonly logger = new Logger(JobsController.name);
  private readonly jobs: Record<string, () => Promise<void>>;

  constructor(reminders: ReminderScheduler, followUps: FollowUpScheduler, purge: PurgeScheduler) {
    this.jobs = {
      reminders: () => reminders.sendDueReminders(),
      "follow-ups": () => followUps.sendDueFollowUps(),
      purge: () => purge.purgeExpiredRows(),
    };
  }

  @Post(":job")
  @HttpCode(200)
  async run(@Param("job") job: string): Promise<{ job: string; durationMs: number }> {
    const run = Object.hasOwn(this.jobs, job) ? this.jobs[job] : undefined;
    if (!run) throw new NotFoundException(`Unknown job. Expected one of: ${Object.keys(this.jobs).join(", ")}.`);
    const startedAt = Date.now();
    await run();
    const durationMs = Date.now() - startedAt;
    this.logger.log(JSON.stringify({ event: "job_triggered", job, durationMs }));
    return { job, durationMs };
  }
}
