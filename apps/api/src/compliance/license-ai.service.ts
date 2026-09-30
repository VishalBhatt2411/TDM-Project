import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { LicenseAiAssessment } from "@tdm/types";
import { env } from "../common/env";
import { errorCodeOf } from "../common/error-code";

const KNOWN_FLAGS = ["blurry", "expired", "name_mismatch", "number_mismatch", "unreadable", "not_a_license"] as const;

const PROMPT = `You are assisting a dealership staff member in reviewing a customer's driving license photo before a test drive. This is an advisory read only — a human will make the final decision.

Look at the license image and respond with ONLY a single JSON object (no markdown, no prose) with this exact shape:
{
  "extractedName": string or null,
  "extractedLicenseNumber": string or null,
  "extractedExpiryDate": string (YYYY-MM-DD) or null,
  "flags": string[] (choose only from: "blurry", "expired", "name_mismatch", "number_mismatch", "unreadable", "not_a_license"),
  "notes": string or null (one short sentence of anything else worth a human's attention)
}

Compare the extracted name and license number against what the customer submitted, and flag "name_mismatch"/"number_mismatch" if they clearly differ. Flag "expired" if the expiry date is in the past relative to today. Flag "not_a_license" if the image does not appear to be a driving license at all.`;

/** Advisory-only AI read of an uploaded license photo — see FR-52. Never sets licenseVerified; a staff member must confirm via ComplianceRecord.confirmLicense(). */
@Injectable()
export class LicenseAiService {
  private readonly logger = new Logger(LicenseAiService.name);
  private readonly client: Anthropic | null;

  constructor() {
    const apiKey = env.anthropicApiKey;
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  async assess(image: Buffer, contentType: string, submittedName: string, submittedLicenseNumber: string): Promise<LicenseAiAssessment> {
    if (!this.client) {
      throw new ServiceUnavailableException("AI license verification is not configured (missing ANTHROPIC_API_KEY).");
    }

    const response = await this.client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: contentType as "image/jpeg" | "image/png" | "image/webp", data: image.toString("base64") } },
            {
              type: "text",
              text: `${PROMPT}\n\nCustomer submitted name: ${submittedName}\nCustomer submitted license number: ${submittedLicenseNumber}`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
    return this.parseAssessment(textBlock?.text ?? "");
  }

  private parseAssessment(rawText: string): LicenseAiAssessment {
    const assessedAt = new Date().toISOString();
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
      const flags = Array.isArray(parsed.flags) ? parsed.flags.filter((f: unknown) => KNOWN_FLAGS.includes(f as any)) : [];
      return {
        extractedName: typeof parsed.extractedName === "string" ? parsed.extractedName : undefined,
        extractedLicenseNumber: typeof parsed.extractedLicenseNumber === "string" ? parsed.extractedLicenseNumber : undefined,
        extractedExpiryDate: typeof parsed.extractedExpiryDate === "string" ? parsed.extractedExpiryDate : undefined,
        flags,
        notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
        assessedAt,
      };
    } catch (error) {
      // The parser's message quotes the response, which describes the licence — never log it.
      this.logger.warn(JSON.stringify({ event: "license_ai_parse_failed", errorCode: errorCodeOf(error) }));
      return { flags: ["ai_parse_error"], notes: "AI response could not be parsed — please review the image manually.", assessedAt };
    }
  }
}
