// Email Search Tool Implementation
import { z } from "zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import dotenv from 'dotenv';
import { draftEmail } from "./tools/draft_email";

dotenv.config();

// Zod schema for individual draft email result
export const derftEmailResultSchema = z.object({
    id: z.string(),
    threadId: z.string().nullable(),
    relevanceScore: z.number().nullable(),
});

// Zod schema for search results for a single Gmail query
export const queryResultSchema = z.object({
    originalQuery: z.string(),
    gmailQuery: z.string(),
    reasoning: z.string(),
    draft_emails: z.array(derftEmailResultSchema),
});

// Zod schema for email search input - now accepts single query
export const DraftEmailInputSchema = z.object({
    query: z
        .string()
        .describe(
            "Natural language description of the email content to generate the draft"
        ),
    // sendAsHtml: z
    //     .boolean()
    //     .nullable()
    //     .default(false)
    //     .describe("Whether the draft email body should be formatted as HTML"),
});

// Zod schema for email search output
export const searchEmailsOutputSchema = z.object({
    results: z.array(queryResultSchema),
    originalQuery: z.string(),
    totalGmailQueries: z.number(),
    totalSearchTime: z.number(),
    timestamp: z.string(),
});

// Type inference from schemas
export type DraftEmailResult = z.infer<typeof derftEmailResultSchema>;
export type QueryResult = z.infer<typeof queryResultSchema>;
export type DarftEmailsInput = z.infer<typeof DraftEmailInputSchema>;
export type DraftEmailsOutput = z.infer<typeof searchEmailsOutputSchema>;

// Tool metadata for agent frameworks
export const searchEmailsMeta = {
    name: "searchEmails",
    displayName: "Search Emails",
    description:
        "Search emails using a single natural language query that gets converted to multiple Gmail searches internally.",
    inputSchema: DraftEmailInputSchema,
    outputSchema: searchEmailsOutputSchema,
};


export const DraftEmailGmailQueryInputSchema = z.object({
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

// - If the query includes multiple draft email requests, break it down into individual subqueries following this schema: ${ DraftEmailGmailQueryInputSchema }


const QuerySimplifierInstructions = `
You are a query simplifier. Your job is to take a complex Draft Email query written in natural language and return one or more simpler, fully-formed subqueries in plain English.

### Guidelines:

- If the query is already simple and focused, return it unchanged.
- Break down complex queries so each one creates a single draft email.
- Query will be in natural language

### Output Format:
Return a plain list of simplified queries. One per line. No bullets, no markdown, no explanation.

---

### Examples

#### Input:
Create a draft email to sam@gmail.com informing him that Keyflow has a new feature.
#### Output:
Create a draft email to sam@gmail.com informing him that Keyflow has a new feature.


#### Input:
Create a draft email to sam@gmail.com about Keyflow's new feature with subject 'New Feature Alert' and also create another draft to marketing@company.com CC sales@company.com about the upcoming product launch with the subject 'Product Launch Update'.
#### Output:
{
  queries: [
    "Create a draft email to sam@gmail.com about Keyflow's new feature with subject 'New Feature Alert'.",
    "Create a draft email to marketing@company.com CC sales@company.com about the upcoming product launch with the subject 'Product Launch Update'."
  ],
  reasoning: "The input query contains instructions for creating two separate draft emails, each with different recipients, subjects, and purposes. Therefore, it is split into two self-contained queries so each can be handled independently."
}

---


`;

const DrfatGmailQueryGeneratorInstructions = `
You are an Email Draft Schema Extractor. Your job is to take a natural language query that describes a draft email and convert it into a structured object that matches the following schema:
${DraftEmailGmailQueryInputSchema}

### Input
A single user-written query in plain English. The query may include:
- Search terms (e.g., topics, keywords)
- Senders or recipients (e.g., "from Sarah", "to john@company.com")
- File types or attachments
- Labels or categories
- Dates (absolute like "March 3rd", or relative like "last week")

You will receive only this one unstructured input.

### Your task
- Convert the user query into a concise Gmail-compatible search string.
- Use Gmail search operators where applicable:
  - from:, to:, subject:, label:, category:, has:attachment, filename:, is:unread, after:, before:, etc.
- Convert any time expressions (e.g., "last month", "after Jan 1", "from May 3rd to June 1st") into after: and/or before: filters using YYYY/MM/DD format.
- Do not use quotation marks around phrases — Gmail search handles them poorly.
- If no date is mentioned, do not include after: or before:.
- Return only the final Gmail query string.
- Do not explain your reasoning, format the response, or include any extra output.

### Examples

#### Input:
unread emails from Dropbox last week  
#### Output:
is:unread from:dropbox after:2025/05/26 before:2025/06/02

#### Input:
messages to alex@company.com about Q3 launch  
#### Output:
to:alex@company.com Q3 launch

#### Input:
emails from Sarah after June 1st  
#### Output:
from:sarah after:2025/06/01

#### Input:
files sent by marketing team about pricing deck  
#### Output:
from:marketing pricing deck has:attachment

#### Input:
emails related to team offsite  
#### Output:
team offsite
`;

const Instructions = `
You are a Draft Email Query Processor. Your job is to take a complex natural language query requesting one or more draft emails, and do the following:

1. Break down the complex query into one or more simpler queries, each describing exactly one draft email.
2. For each simplified query, extract all relevant information and convert it into a structured JSON object matching the given schema
`


const QuerySimplifierSchema = z.object({
    queries: z.array(DraftEmailGmailQueryInputSchema),
});

type QuerySimplifierResponse = z.infer<typeof QuerySimplifierSchema>;

async function breakdownQuery(
    openaiClient: OpenAI,
    query: string
): Promise<z.infer<typeof QuerySimplifierSchema>> {
    const response = await openaiClient.responses.parse({
        model: "gpt-4.1-mini",
        instructions: Instructions,
        input: query,
        text: {
            format: zodTextFormat(QuerySimplifierSchema, "simplified_queries"),
        },
    });

    return response.output_parsed as z.infer<typeof QuerySimplifierSchema>;
}


const QueryGeneratorSchema = z.object({
    query: z.string(),
    reasoning: z.string(),
});

const EmailResultExtractorSchema = z.object({
    emails: z.array(derftEmailResultSchema),
});

// Function to search emails for a single Gmail query
async function searchEmailsForGmailQuery(
    openaiClient: OpenAI,
    // mcpClient: Client,
    query: string,
    originalQuery: string,
    maxResults: number
)
// : Promise<QueryResult> 

{
    const startTime = Date.now();

    const queryResponse = await openaiClient.responses.parse({
        model: "gpt-4.1-mini",
        instructions: DrfatGmailQueryGeneratorInstructions,
        input: query,
        text: {
            format: zodTextFormat(QueryGeneratorSchema, "query"),
        },
    });

    const generatedQuery = queryResponse.output_parsed;
    console.log("Gmail Query", generatedQuery);

    // const searchResults = await callTool(mcpClient, "GMAIL_FETCH_EMAILS", {
    //     query: generatedQuery?.query || "",
    //     max_results: maxResults,
    // });

    // const emailResults = await openaiClient.responses.parse({
    //     model: "gpt-4.1-mini",
    //     instructions: "Extract the email results from the following JSON response",
    //     input: JSON.stringify(searchResults) || "",
    //     text: {
    //         format: zodTextFormat(EmailResultExtractorSchema, "email_results"),
    //     },
    // });

    // const searchTime = Date.now() - startTime;

    // return {
    //     originalQuery,
    //     gmailQuery: generatedQuery?.query || "",
    //     reasoning: generatedQuery?.reasoning || "",
    //     draft_emails: emailResults.output_parsed?.emails || [],
    // };
}

// Main email Draft Email function
export async function darftEmails(
    input: DarftEmailsInput
)
// : Promise<DraftEmailsOutput>
{

    const startTime = Date.now();

    // Validate input with Zod
    const validatedInput = DraftEmailInputSchema.parse(input);

    const { query } = validatedInput;


    const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    // Convert single natural language query to multiple Gmail queries
    const gmailQueries = await breakdownQuery(openaiClient, query);
    console.log("Breakdown Query\n", JSON.stringify(gmailQueries));

    // Execute searches for all Gmail queries in parallel
    const draftEmailPromise = gmailQueries.queries.map((draftEmailQuery) =>

        draftEmail(
            draftEmailQuery,
        )

    );

    const results = await Promise.all(draftEmailPromise);

    console.log("Results", results);

    // const totalSearchTime = Date.now() - startTime;

    // return {
    //     results,
    //     originalQuery: query,
    //     totalGmailQueries: gmailQueries.queries.length,
    //     totalSearchTime,
    //     timestamp: new Date().toISOString(),
    // };
}

const query = `
Create a draft to 190420107535.co19s2@scet.ac.in and niralinavadiya19@gmail.com stating that Keyflow has a new feature update. Include the changelog URL: https://www.keyflow.space/changelog.
`;



(async () => {
    await darftEmails({
        query: "Create a draft to 190420107535.co19s2@scet.ac.in and niralinavadiya19@gmail.com stating that Keyflow has a new feature update. Include the changelog URL: https://www.keyflow.space/changelog.and create draft email to bjfrjf@gmail.com that issue is solved"
    })

    // await draftEmail(
    //     {
    //         to: null,
    //         cc: null,
    //         bcc: null,
    //         subject: "Re: Your reported issue",
    //         body: "Hello,\n\nWe would like to inform you that the reported issue has been resolved.\n\nBest regards,",
    //         labels: null,
    //         sendAsHtml: false,
    //         threadId: "1974ed2a316fc7ab",
    //         messageId: "1974ed2a316fc7ab",
    //         attachments: null
    //     }
    // )
})()