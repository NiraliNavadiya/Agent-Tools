// Email Search Tool Implementation
import { z } from "zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

// Zod schema for individual email result
export const emailResultSchema = z.object({
    id: z.string(),
    subject: z.string(),
    sender: z.string(),
    recipient: z.string(),
    date: z.string(),
    snippet: z.string(),
    labels: z.array(z.string()).nullable(),
    threadId: z.string().nullable(),
    isRead: z.boolean().nullable(),
    hasAttachments: z.boolean().nullable(),
    relevanceScore: z.number().nullable(),
});

// Zod schema for search results for a single Gmail query
export const queryResultSchema = z.object({
    originalQuery: z.string(),
    gmailQuery: z.string(),
    reasoning: z.string(),
    emails: z.array(emailResultSchema),
    searchTime: z.number(),
});

// Zod schema for email search input - now accepts single query
export const searchEmailsInputSchema = z.object({
    query: z
        .string()
        .min(1, "Query cannot be empty")
        .describe(
            "Natural language search query that will be converted to multiple Gmail searches"
        ),
    maxResultsPerQuery: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe("Maximum number of email results to return per Gmail query"),
    includeAttachments: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to include emails with attachments in results"),
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
export type EmailResult = z.infer<typeof emailResultSchema>;
export type QueryResult = z.infer<typeof queryResultSchema>;
export type SearchEmailsInput = z.infer<typeof searchEmailsInputSchema>;
export type SearchEmailsOutput = z.infer<typeof searchEmailsOutputSchema>;

// Tool metadata for agent frameworks
export const searchEmailsMeta = {
    name: "searchEmails",
    displayName: "Search Emails",
    description:
        "Search emails using a single natural language query that gets converted to multiple Gmail searches internally.",
    inputSchema: searchEmailsInputSchema,
    outputSchema: searchEmailsOutputSchema,
};

const QuerySimplifierInstructions = `
You are a query simplifier. Your job is to take a complex Gmail search query written in natural language and return one or more simpler, fully-formed subqueries in plain English.

Today's date is ${new Date().toISOString().split("T")[0]
    }. Use this to normalize any relative date references.

### Your Instructions:

- If the query is already simple and focused, return it unchanged.
- If the query contains multiple conditions (e.g., multiple senders, topics, filters, time ranges), break it down into **well-formed subqueries**.
- Each subquery should:
  - Be **complete and self-contained**.
  - Include **all relevant filters** (e.g., unread, from, attachments, dates, etc.).
  - Use **normalized calendar dates** for any relative time expressions.
  - Be written in **natural language**, not Gmail syntax.
  - Make logical combinations that reflect the original query intent.

### Time normalization examples:
- "last week" → after 2025/05/26 and before 2025/06/02  
- "past 7 days" → after 2025/05/28  
- "this month" → after 2025/06/01  
- "before May 15" → before 2025/05/15  
- "from May 1 to May 20" → after 2025/05/01 and before 2025/05/20

### Output Format:
Return a plain list of simplified queries. One per line. No bullets, no markdown, no explanation.

---

### Examples

#### Input:
emails from Dropbox  
#### Output:
emails from Dropbox

---

#### Input:
unread emails from Dropbox or Stripe with attachments sent last week  
#### Output:
Unread emails from Dropbox after 2025/05/26 and before 2025/06/02  
Unread emails from Dropbox with attachments after 2025/05/26 and before 2025/06/02  
Unread emails from Stripe after 2025/05/26 and before 2025/06/02  
Unread emails from Stripe with attachments after 2025/05/26 and before 2025/06/02

---

#### Input:
emails from HR or recruiting@company.com about interview feedback this month  
#### Output:
Emails from HR about interview feedback after 2025/06/01  
Emails from recruiting@company.com about interview feedback after 2025/06/01

`;

const GmailQueryGeneratorInstructions = `
You are a converter that transforms a natural language Gmail search request into a valid Gmail search query string for use with the Gmail API's q parameter.

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

const QuerySimplifierSchema = z.object({
    queries: z.array(z.string()),
    reasoning: z.string(),
});

type QuerySimplifierResponse = z.infer<typeof QuerySimplifierSchema>;

async function breakdownQuery(
    openaiClient: OpenAI,
    query: string
): Promise<QuerySimplifierResponse> {
    const response = await openaiClient.responses.parse({
        model: "gpt-4.1-mini",
        instructions: QuerySimplifierInstructions,
        input: query,
        text: {
            format: zodTextFormat(QuerySimplifierSchema, "simplified_queries"),
        },
    });

    return response.output_parsed as QuerySimplifierResponse;
}

const QueryGeneratorSchema = z.object({
    query: z.string(),
    reasoning: z.string(),
});

const EmailResultExtractorSchema = z.object({
    emails: z.array(emailResultSchema),
});

// Function to search emails for a single Gmail query
async function searchEmailsForGmailQuery(
    openaiClient: OpenAI,
    mcpClient: Client,
    query: string,
    originalQuery: string,
    maxResults: number
): Promise<QueryResult> {
    const startTime = Date.now();

    const queryResponse = await openaiClient.responses.parse({
        model: "gpt-4.1-mini",
        instructions: GmailQueryGeneratorInstructions,
        input: query,
        text: {
            format: zodTextFormat(QueryGeneratorSchema, "query"),
        },
    });

    const generatedQuery = queryResponse.output_parsed;
    console.log("Gmail Query", generatedQuery);

    const searchResults = await callTool(mcpClient, "GMAIL_FETCH_EMAILS", {
        query: generatedQuery?.query || "",
        max_results: maxResults,
    });

    const emailResults = await openaiClient.responses.parse({
        model: "gpt-4.1-mini",
        instructions: "Extract the email results from the following JSON response",
        input: JSON.stringify(searchResults) || "",
        text: {
            format: zodTextFormat(EmailResultExtractorSchema, "email_results"),
        },
    });

    const searchTime = Date.now() - startTime;

    return {
        originalQuery,
        gmailQuery: generatedQuery?.query || "",
        reasoning: generatedQuery?.reasoning || "",
        emails: emailResults.output_parsed?.emails || [],
        searchTime,
    };
}

// Main email search function
export async function searchEmails(
    input: SearchEmailsInput
): Promise<SearchEmailsOutput> {
    const startTime = Date.now();

    // Validate input with Zod
    const validatedInput = searchEmailsInputSchema.parse(input);

    const { query, maxResultsPerQuery } = validatedInput;

    console.log("input", process.env.GMAIL_MCP_URL);

    const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const mcpClient = await createMCPClient(process.env.GMAIL_MCP_URL!);

    // Convert single natural language query to multiple Gmail queries
    const gmailQueries = await breakdownQuery(openaiClient, query);
    console.log("Breakdown Query", gmailQueries);

    // Execute searches for all Gmail queries in parallel
    const searchPromises = gmailQueries.queries.map((gmailQuery) =>
        searchEmailsForGmailQuery(
            openaiClient,
            mcpClient.client as Client,
            gmailQuery,
            query,
            maxResultsPerQuery
        )
    );

    const results = await Promise.all(searchPromises);

    console.log("Results", results);

    const totalSearchTime = Date.now() - startTime;

    return {
        results,
        originalQuery: query,
        totalGmailQueries: gmailQueries.queries.length,
        totalSearchTime,
        timestamp: new Date().toISOString(),
    };
}

// Example usage patterns for documentation
export const searchEmailsExamples = [
    {
        query: "Find emails about the Q3 launch meeting with Sarah",
        description:
            "Complex query that gets broken down into multiple Gmail searches",
    },
    {
        query: "Show me urgent emails from last week",
        maxResultsPerQuery: 5,
        description: "Time-based query with urgency filtering",
    },
    {
        query: "Files from the marketing team about pricing",
        includeAttachments: true,
        description: "Attachment-focused search with team and topic context",
    },
] as const;
