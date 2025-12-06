import { NextResponse } from "next/server";
import { contactFormSchema } from "@/lib/schemas";
import { env } from "@/lib/env";
import {
  checkRateLimit,
  getClientIp,
  rateLimitPresets,
} from "@/lib/api/rate-limit";

export async function POST(request: Request) {
  try {
    // Rate limiting check
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(clientIp, rateLimitPresets.contact);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          hasError: true,
          errorMessage: `送信回数の制限に達しました。${Math.ceil(rateLimit.resetIn / 1000)}秒後に再度お試しください。`,
          uuid: "",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(rateLimit.resetIn / 1000)),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
    }

    const body = await request.json();
    const result = contactFormSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          hasError: true,
          errorMessage: "入力内容に誤りがあります。",
          uuid: "",
        },
        { status: 400 }
      );
    }

    // Check webhook URL configuration
    const webhookUrl = env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error("[Contact API] SLACK_WEBHOOK_URL is not configured");
      return NextResponse.json(
        {
          hasError: true,
          errorMessage: "サーバー設定エラーです。管理者にお問い合わせください。",
          uuid: "",
        },
        { status: 500 }
      );
    }

    const data = result.data;
    const uuid = crypto.randomUUID();

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `お問い合わせ: ${data.title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*返信希望:*\n${data.requiresReply ? "はい" : "いいえ"}`,
          },
          {
            type: "mrkdwn",
            text: `*Eメール:*\n${data.email || "（未入力）"}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*お問い合わせ内容:*\n${data.message}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `お問い合わせ番号: ${uuid}`,
          },
        ],
      },
    ];

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          hasError: true,
          errorMessage:
            "送信に失敗しました。しばらく時間をおいてから再度お試しください。",
          uuid: "",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      hasError: false,
      errorMessage: "",
      uuid,
    });
  } catch {
    return NextResponse.json(
      {
        hasError: true,
        errorMessage:
          "送信に失敗しました。しばらく時間をおいてから再度お試しください。",
        uuid: "",
      },
      { status: 500 }
    );
  }
}
