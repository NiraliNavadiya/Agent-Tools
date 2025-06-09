import { Auth, gmail_v1, google } from 'googleapis';
import z from "zod";

export const DraftEmailInputSchema = z.object({
    to: z.array(z.string()).describe("List of recipient email addresses"),
    cc: z.array(z.string()).nullable().describe("Optional list of CC (carbon copy) email addresses"),
    bcc: z.array(z.string()).nullable().describe("Optional list of BCC (blind carbon copy) email addresses"),
    subject: z.string().describe("Subject line of the draft email"),
    body: z.string().describe("Main content or body of the draft email"),
    labels: z.array(z.string()).nullable().describe("Optional list of Gmail labels to apply to the draft"),
    sendAsHtml: z.boolean().nullable().describe("Whether the email body is in HTML format; if false or null, treated as plain text"),
    threadId: z.string().nullable().describe("Optional Gmail thread ID to associate the draft with an existing conversation"),
    attachments: z
        .array(
            z.object({
                filename: z.string().describe("Name of the attachment file"),
                mimeType: z.string().describe("MIME type of the attachment (e.g., 'application/pdf')"),
                data: z.string().describe("Base64-encoded string representing the file content"),
            })
        )
        .nullable()
        .describe("Optional list of attachments to include in the draft email"),
});
export type IDraftEmailInput = z.infer<typeof DraftEmailInputSchema>;

export type IDraftEmailOutput = {
    id?: string | null;
    threadId?: string | null;
    messageId?: string | null;
};

/**
 * Creates a new draft email in the authorized user's Gmail account.
 * @param input DraftEmailInput containing to, cc, bcc, subject, body, optional attachments, and optional sendAsHtml flag
 * @returns DraftEmailOutput with draft id, threadId and raw message text
 */
export async function draftEmail(
    input: IDraftEmailInput
): Promise<IDraftEmailOutput> {

    if (input.to && input.to.length === 0) {
        throw new Error('Please provide at least one recipient');
    }

    const oAuth2Client = new google.auth.OAuth2();
    oAuth2Client.setCredentials({ access_token: process.env.ACCESS_TOKEN, refresh_token: process.env.REFRESH_TOKEN });
    const gmail: gmail_v1.Gmail = google.gmail({ version: "v1", auth: oAuth2Client });



    const rawMessage = buildRawEmail({
        body: input.body,
        subject: input.subject,
        to: input.to ?? undefined,
        bcc: input.bcc ?? undefined,
        cc: input.cc ?? undefined,
    });

    const message = await createDraft(gmail, {
        rawMessage,
        threadId: input.threadId ?? undefined,
    });

    console.log(' ------------------- message------------------', message)

    return {
        id: message.id,
        messageId: message?.messageId,
        threadId: message?.threadId,
    };
}

async function createDraft(
    gmail: gmail_v1.Gmail,
    {
        rawMessage,
        threadId,
    }: {
        rawMessage: string;
        threadId?: string;
    }
): Promise<IDraftEmailOutput> {
    try {
        const res = await gmail.users.drafts.create({
            userId: "me",
            requestBody: {
                message: {
                    raw: rawMessage,
                    threadId,
                },
            },
        });

        const draft = res.data;
        const message = draft?.message;

        return {
            id: draft.id,
            messageId: message?.id,
            threadId: message?.threadId,
        };
    } catch (error) {
        console.error(error);
        throw error;
    }
}


export function buildRawEmail(input: {
    to?: string[];
    subject: string;
    body: string;
    cc?: string[];
    bcc?: string[];
    inReplyTo?: string;
    references?: string;
    isReply?: boolean;
}): string {
    const emailLines = [
        ...(input?.to ? [`To: ${input.to.join(", ")}`] : []),
        `Subject: ${input.isReply ? `Re: ${input.subject}` : input.subject}`,
        ...(input?.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
        ...(input?.references ? [`References: ${input.references}`] : []),
        ...(input?.cc ? [`Cc: ${input.cc.join(", ")}`] : []),
        ...(input?.bcc ? [`Bcc: ${input.bcc.join(", ")}`] : []),
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 7bit",
        "",
        input.body,
    ];

    return Buffer.from(emailLines.join("\n"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
