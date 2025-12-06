import { NextResponse } from "next/server";
import { contactFormSchema } from "@/lib/schemas";

const SLACK_WEBHOOK_URL =
  "https://example.invalid/redacted-slack-webhook";

export async function POST(request: Request) {
  try {
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

    const response = await fetch(SLACK_WEBHOOK_URL, {
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
